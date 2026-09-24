/**
 * Paddle → RevenueCat bridge.
 *
 * A purchase on vtune-app.com goes through Paddle directly (see the checkout
 * in pricing.html), which RevenueCat never hears about on its own. The app
 * asks RevenueCat and only RevenueCat whether `pro` is active, so without
 * this endpoint a website customer pays, gets nothing, and quietly runs down
 * the rest of their trial before being locked out of something they own.
 *
 * The linkage is already in place: the checkout requires sign-in and sends
 * the buyer's Supabase id as `custom_data.app_user_id`. This picks it up and
 * grants the entitlement against that same id — which is the id the app uses
 * as its RevenueCat App User ID, so the unlock lands on every device.
 *
 * ── Environment (Vercel → Project → Settings → Environment Variables) ──
 *   PADDLE_WEBHOOK_SECRET   Paddle → Notifications → your destination.
 *                           Required. Without it every request is rejected.
 *   PADDLE_WEBHOOK_SECRET_SANDBOX
 *                           Optional. The sandbox destination's own secret —
 *                           sandbox and live are separate environments and
 *                           do not share one. Either may be a comma-
 *                           separated list if a destination gets rotated.
 *   REVENUECAT_SECRET_KEY   RevenueCat → Project → API keys → *secret*.
 *                           NOT one of the public SDK keys in src/pro/config.ts;
 *                           this one can grant entitlements to anybody.
 *   PADDLE_API_KEY          Optional. Only needed to process refunds — see
 *                           appUserIdForTransaction below.
 *   RC_ENTITLEMENT_ID       Optional, defaults to 'pro'.
 *
 * Point Paddle at https://vtune-app.com/api/paddle-webhook and subscribe to
 * `transaction.completed`, `adjustment.created` AND `adjustment.updated`.
 *
 * `adjustment.updated` is not optional. A refund on a live account is created
 * as `pending_approval` and only becomes `approved` when Paddle reviews it,
 * and that decision arrives as an update. Subscribe to `created` alone and a
 * refund will never revoke anything, because the only event you get is the
 * one that says "somebody has asked".
 */
import crypto from 'node:crypto';

// The .mjs extension is load-bearing: this project's root is landing/, which
// has no package.json, so a .js file here is treated as CommonJS and the
// import above throws before any of this runs.
//
// Node (req, res) signature, not the Web one — this runtime serves the
// former and simply hangs waiting for a response if you return a Response.
export const config = { api: { bodyParser: false } };

/**
 * Paddle signs the exact bytes it sent, so verification needs those bytes.
 *
 * Three ways of getting them, in descending order of trust:
 *   1. A raw buffer the runtime kept for us.
 *   2. The request stream, when nothing has consumed it.
 *   3. Re-serialising the parsed body — because `bodyParser: false` above is
 *      a Next.js convention this runtime doesn't honour, and by the time we
 *      run, the body is already an object.
 *
 * (3) is a reconstruction and can differ from the original over whitespace or
 * escaping. That can only ever cause a *failed* verification, never a false
 * pass, so it's safe — but it's also why the chosen path is logged: if
 * genuine webhooks start 401ing, the log says which route produced the bytes.
 */
async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return { raw: req.rawBody.toString('utf8'), via: 'rawBody' };
  if (typeof req.rawBody === 'string') return { raw: req.rawBody, via: 'rawBody' };
  if (Buffer.isBuffer(req.body)) return { raw: req.body.toString('utf8'), via: 'body-buffer' };
  if (typeof req.body === 'string') return { raw: req.body, via: 'body-string' };

  if (req.readable && !req.readableEnded) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length) return { raw: Buffer.concat(chunks).toString('utf8'), via: 'stream' };
  }

  if (req.body && typeof req.body === 'object') {
    return { raw: JSON.stringify(req.body), via: 'reserialised' };
  }
  return { raw: null, via: 'none' };
}

const RC_API = 'https://api.revenuecat.com/v1';
const PADDLE_API = 'https://api.paddle.com';

/** How stale a signature may be. Bounds the window for replaying a captured
 *  request; Paddle's own retries are well inside it. */
const MAX_SIGNATURE_AGE_S = 5 * 60;

/**
 * Adjustment actions that take the unlock away — once they are APPROVED.
 *
 * A chargeback costs the money and the fee, so it revokes like a refund.
 * Deliberately narrow beyond those two: `chargeback_warning` is a dispute
 * being opened rather than decided, and revoking on it would lock out a
 * customer who may well win. `credit` is an adjustment against an invoice,
 * not a reversal of the sale.
 */
const REVOKING_ACTIONS = new Set(['refund', 'chargeback']);

/**
 * Actions that hand the unlock back: the money returned to us.
 *
 * `chargeback_reverse` is a dispute we won. `credit_reverse` undoes a credit.
 * Paddle raises these as new adjustments, and separately moves the original
 * adjustment to status `reversed` — so a reversal can arrive by either road
 * and both are handled. Re-granting is idempotent, so seeing both is fine.
 */
const RESTORING_ACTIONS = new Set(['chargeback_reverse', 'credit_reverse']);

/**
 * The status that means money has actually moved.
 *
 * This is the whole point of the gate. A refund on a live account is created
 * as `pending_approval` and stays there until Paddle reviews it — which can
 * take days, and which they may refuse. Acting on creation revoked the unlock
 * the moment a refund was *requested*, before a penny had moved and while the
 * customer could still be told no. Paddle then re-raises the adjustment as
 * `adjustment.updated` carrying `approved` or `rejected`, which is the event
 * that actually decides it.
 *
 * (Sandbox approves refunds automatically every ten minutes, so this reads as
 * a short delay there rather than a wait for a human.)
 */
const MONEY_MOVED = 'approved';
const REVERSED = 'reversed';

/**
 * Every webhook secret we'll accept, in the order they're tried.
 *
 * Paddle's sandbox and live are separate environments with separate
 * notification destinations, each with its own secret — so testing a
 * purchase against a live-only secret can never verify, however correct
 * everything else is. Both may be set, and either may hold a comma-separated
 * list if a destination is ever rotated or replaced.
 */
function webhookSecrets() {
  return [process.env.PADDLE_WEBHOOK_SECRET, process.env.PADDLE_WEBHOOK_SECRET_SANDBOX]
    .flatMap((v) => (v ? String(v).split(',') : []))
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Verify Paddle's `Paddle-Signature: ts=...;h1=...` header.
 *
 * This is the whole security of the endpoint. Skip it and the URL becomes a
 * free lifetime unlock for anyone who finds it.
 *
 * Returns a reason rather than a bare false, because "rejected" has several
 * quite different causes — a stale replay and a mismatched secret want
 * opposite responses, and guessing between them from the outside is exactly
 * the sort of thing that wastes an afternoon.
 */
function verifySignature(rawBody, header, secrets) {
  if (!header) return { ok: false, reason: 'no Paddle-Signature header' };
  if (secrets.length === 0) return { ok: false, reason: 'no webhook secret configured' };

  let ts = null;
  let h1 = null;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 'ts') ts = value;
    else if (key === 'h1') h1 = value;
  }
  if (!ts || !h1) return { ok: false, reason: 'malformed signature header' };

  const ageS = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(ageS)) return { ok: false, reason: 'unparseable timestamp' };
  if (ageS > MAX_SIGNATURE_AGE_S) {
    return { ok: false, reason: `timestamp stale by ${Math.round(ageS)}s` };
  }

  const given = Buffer.from(h1, 'utf8');
  for (let i = 0; i < secrets.length; i++) {
    const expected = Buffer.from(
      crypto.createHmac('sha256', secrets[i]).update(`${ts}:${rawBody}`).digest('hex'),
      'utf8',
    );
    // Length-checked first because timingSafeEqual throws on a mismatch
    // rather than returning false.
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) {
      return { ok: true, secretIndex: i };
    }
  }
  return { ok: false, reason: `no configured secret matched (tried ${secrets.length})` };
}

async function revenueCat(method, path, body, key) {
  const res = await fetch(`${RC_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Grant the unlock.
 *
 * Two calls, and the first one matters. The promotional endpoint won't
 * create a subscriber it has never heard of — it 404s with "The subscriber
 * was not found" — and that is the normal case here, because someone can buy
 * on the website before they have ever opened the app signed in. A plain GET
 * on the subscriber is RevenueCat's get-or-create, so it brings the record
 * into existence for the grant that follows.
 *
 * 'lifetime' because V-Tune is a one-time purchase. Re-granting is harmless,
 * which is what makes it safe for Paddle to retry this endpoint.
 */
async function grant(appUserId, entitlement, key) {
  const id = encodeURIComponent(appUserId);
  await revenueCat('GET', `/subscribers/${id}`, null, key);
  return revenueCat(
    'POST',
    `/subscribers/${id}/entitlements/${encodeURIComponent(entitlement)}/promotional`,
    { duration: 'lifetime' },
    key,
  );
}

function revoke(appUserId, entitlement, key) {
  return revenueCat(
    'POST',
    `/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlement)}/revoke_promotionals`,
    {},
    key,
  );
}

/**
 * Who a refunded transaction belonged to, and what they paid.
 *
 * Paddle's adjustment events carry a transaction id but not the original
 * transaction's custom_data, so the buyer's app user id has to be fetched
 * back. The total comes along for the ride because it is what separates a
 * full refund from a partial one — see handleAdjustment.
 *
 * Needs PADDLE_API_KEY; without it refunds are logged and skipped rather
 * than failing the webhook, so the grant path can ship on its own.
 */
async function transactionFacts(transactionId, paddleKey) {
  if (!paddleKey || !transactionId) return null;
  const res = await fetch(`${PADDLE_API}/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${paddleKey}` },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const appUserId = json?.data?.custom_data?.app_user_id ?? null;
  if (!appUserId) return null;
  // Minor units, as a string, same as every other Paddle amount. Null when
  // the shape isn't what we expect — the caller treats that as "can't tell".
  const raw = json?.data?.details?.totals?.total;
  const total = raw === undefined || raw === null ? null : Number(raw);
  return { appUserId, total: Number.isFinite(total) ? total : null };
}

/**
 * Decide an adjustment, and act on it.
 *
 * The rules, in the order they apply:
 *
 *   1. A reversal gives the unlock back. Either the new `chargeback_reverse`
 *      adjustment, or the original one moving to status `reversed`.
 *   2. Only `refund` and `chargeback` can take it away, and only once
 *      `approved`. A `pending_approval` refund has moved no money and may
 *      yet be refused; a `rejected` one never will.
 *   3. A partial refund keeps the unlock. On a one-time purchase, somebody
 *      who was given ten pounds back still bought the thing, and taking the
 *      app away from them would be a worse mistake than the goodwill was
 *      worth. Full refunds revoke.
 *
 * Known gap on (3): several partial refunds that together add up to the
 * whole price each look partial on their own, so none of them revokes.
 * Catching that means summing every approved adjustment on the transaction,
 * which is a second API call for a case that needs someone to refund the
 * same one-off purchase twice. The partial is logged instead, so it is
 * visible if it ever happens.
 */
async function handleAdjustment(data, entitlement, rcKey, paddleKey) {
  const { action, status, transaction_id: txnId, id: adjId } = data ?? {};

  const restoring =
    RESTORING_ACTIONS.has(action) ||
    (REVOKING_ACTIONS.has(action) && status === REVERSED);
  const revoking = REVOKING_ACTIONS.has(action) && !restoring;

  if (!restoring && !revoking) {
    return { ok: true, ignored: `${action}/${status}` };
  }

  if (revoking && status !== MONEY_MOVED) {
    console.log(
      `paddle-webhook: ${action} ${adjId} on txn ${txnId} is ${status}, not ${MONEY_MOVED} — ` +
        'leaving the unlock alone',
    );
    return { ok: true, skipped: `${action} is ${status}` };
  }

  const facts = await transactionFacts(txnId, paddleKey);
  if (!facts) {
    console.warn(
      `paddle-webhook: ${action} on txn ${txnId} not actioned — no app_user_id ` +
        '(set PADDLE_API_KEY to enable refund handling)',
    );
    return { ok: true, skipped: 'no app_user_id for adjustment' };
  }

  if (restoring) {
    await grant(facts.appUserId, entitlement, rcKey);
    console.log(
      `paddle-webhook: restored ${entitlement} to ${facts.appUserId} (${action}, txn ${txnId})`,
    );
    return { ok: true, restored: facts.appUserId };
  }

  const refunded = Number(data?.totals?.total);
  const partial =
    Number.isFinite(refunded) && facts.total !== null && refunded < facts.total;
  if (partial) {
    console.log(
      `paddle-webhook: partial ${action} on txn ${txnId} ` +
        `(${refunded} of ${facts.total}) — unlock kept for ${facts.appUserId}`,
    );
    return { ok: true, skipped: 'partial refund' };
  }

  await revoke(facts.appUserId, entitlement, rcKey);
  console.log(
    `paddle-webhook: revoked ${entitlement} from ${facts.appUserId} (${action}, txn ${txnId})`,
  );
  return { ok: true, revoked: facts.appUserId };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rcKey = process.env.REVENUECAT_SECRET_KEY;
  const entitlement = process.env.RC_ENTITLEMENT_ID || 'pro';

  if (webhookSecrets().length === 0 || !rcKey) {
    // Misconfigured rather than unauthorised. 500 so Paddle retries once the
    // variables are in place, instead of dropping a real purchase.
    console.error('paddle-webhook: PADDLE_WEBHOOK_SECRET or REVENUECAT_SECRET_KEY missing');
    return res.status(500).json({ error: 'Not configured' });
  }

  let raw, via;
  try {
    ({ raw, via } = await readRawBody(req));
  } catch (err) {
    console.error('paddle-webhook: could not read body —', err?.message ?? err);
    return res.status(400).json({ error: 'Unreadable body' });
  }
  if (raw === null) {
    console.error('paddle-webhook: no body on the request');
    return res.status(400).json({ error: 'Unreadable body' });
  }

  const secrets = webhookSecrets();
  const check = verifySignature(raw, req.headers['paddle-signature'], secrets);
  if (!check.ok) {
    // Deliberately descriptive, and deliberately free of anything secret:
    // lengths and shapes, never values. Enough to tell a wrong secret from a
    // truncated paste from a replay, without putting a credential in a log.
    console.warn(
      `paddle-webhook: rejected — ${check.reason}. body via ${via}, ${raw.length} bytes; ` +
        `secrets configured: ${secrets
          .map((sec, i) => `#${i} len=${sec.length} ntfset=${sec.startsWith('pdl_ntfset_')}`)
          .join(', ') || 'none'}`,
    );
    return res.status(401).json({ error: 'Bad signature' });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Bad JSON' });
  }

  const type = event?.event_type;
  const data = event?.data ?? {};

  try {
    if (type === 'transaction.completed') {
      const appUserId = data?.custom_data?.app_user_id;
      if (!appUserId) {
        // Worth shouting about: a sale completed that can't be attached to
        // anyone, which means somebody has paid for nothing.
        console.error('paddle-webhook: transaction.completed with no app_user_id', data?.id);
        return res.status(200).json({ ok: true, skipped: 'no app_user_id' });
      }
      await grant(appUserId, entitlement, rcKey);
      console.log(`paddle-webhook: granted ${entitlement} to ${appUserId} (txn ${data?.id})`);
      return res.status(200).json({ ok: true, granted: appUserId });
    }

    // Both events, because the one that decides a refund is the update.
    // `adjustment.created` announces a refund that has been *asked for*;
    // `adjustment.updated` is Paddle coming back with approved or rejected.
    if (type === 'adjustment.created' || type === 'adjustment.updated') {
      const result = await handleAdjustment(
        data,
        entitlement,
        rcKey,
        process.env.PADDLE_API_KEY,
      );
      return res.status(200).json(result);
    }

    // Anything else is fine, just not ours. 200 so Paddle stops retrying.
    return res.status(200).json({ ok: true, ignored: type });
  } catch (err) {
    // 500 makes Paddle retry, which is what we want: a transient RevenueCat
    // failure shouldn't cost somebody their unlock.
    console.error('paddle-webhook:', err?.message ?? err);
    return res.status(500).json({ error: 'Handler failed' });
  }
}
