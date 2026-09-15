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
 *   REVENUECAT_SECRET_KEY   RevenueCat → Project → API keys → *secret*.
 *                           NOT one of the public SDK keys in src/pro/config.ts;
 *                           this one can grant entitlements to anybody.
 *   PADDLE_API_KEY          Optional. Only needed to process refunds — see
 *                           appUserIdForTransaction below.
 *   RC_ENTITLEMENT_ID       Optional, defaults to 'pro'.
 *
 * Point Paddle at https://vtune-app.com/api/paddle-webhook and subscribe to
 * `transaction.completed` and `adjustment.created`.
 */
import crypto from 'node:crypto';

// Web handler signature (Request in, Response out) rather than Node's
// (req, res). Paddle signs the exact bytes it sent, and the Node signature
// on this runtime hands over a body that has already been parsed into an
// object — at which point the original formatting is gone and no signature
// can ever match. `request.text()` is the bytes, untouched.
//
// The .mjs extension is load-bearing too: this project's root is landing/,
// which has no package.json, so a .js file here is treated as CommonJS and
// the import above throws before any of this runs.
export const config = { runtime: 'nodejs' };

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const RC_API = 'https://api.revenuecat.com/v1';
const PADDLE_API = 'https://api.paddle.com';

/** How stale a signature may be. Bounds the window for replaying a captured
 *  request; Paddle's own retries are well inside it. */
const MAX_SIGNATURE_AGE_S = 5 * 60;

/**
 * Adjustment actions that take the unlock away.
 *
 * A chargeback costs the money and the fee, so it revokes like a refund.
 * Deliberately narrow beyond those two: `chargeback_warning` is a dispute
 * being opened rather than decided, and revoking on it would lock out a
 * customer who may well win. `credit` is a partial adjustment against an
 * invoice, not a reversal of the sale. The reversal actions
 * (`chargeback_reverse`, `credit_reverse`) mean the money came back — if
 * either ever shows up here, the entitlement needs re-granting, not revoking.
 */
const REVOKING_ACTIONS = new Set(['refund', 'chargeback']);

/**
 * Verify Paddle's `Paddle-Signature: ts=...;h1=...` header.
 *
 * This is the whole security of the endpoint. Skip it and the URL becomes a
 * free lifetime unlock for anyone who finds it.
 */
function signatureValid(rawBody, header, secret) {
  if (!header || !secret) return false;

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
  if (!ts || !h1) return false;

  const ageS = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(ageS) || ageS > MAX_SIGNATURE_AGE_S) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}:${rawBody}`)
    .digest('hex');

  // Constant-time, and length-checked first because timingSafeEqual throws
  // on a length mismatch rather than returning false.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(h1, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function revenueCat(path, body, key) {
  const res = await fetch(`${RC_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Grant the unlock.
 *
 * 'lifetime' because V-Tune is a one-time purchase, and granting against an
 * app user id RevenueCat hasn't seen yet creates the subscriber — which is
 * the normal case here, since someone can buy on the website before they've
 * ever opened the app signed in.
 */
function grant(appUserId, entitlement, key) {
  return revenueCat(
    `/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlement)}/promotional`,
    { duration: 'lifetime' },
    key,
  );
}

function revoke(appUserId, entitlement, key) {
  return revenueCat(
    `/subscribers/${encodeURIComponent(appUserId)}/entitlements/${encodeURIComponent(entitlement)}/revoke_promotionals`,
    {},
    key,
  );
}

/**
 * Find who a refunded transaction belonged to.
 *
 * Paddle's adjustment events carry a transaction id but not the original
 * transaction's custom_data, so the buyer's app user id has to be fetched
 * back. Needs PADDLE_API_KEY; without it refunds are logged and skipped
 * rather than failing the webhook, so the grant path can ship on its own.
 */
async function appUserIdForTransaction(transactionId, paddleKey) {
  if (!paddleKey || !transactionId) return null;
  const res = await fetch(`${PADDLE_API}/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${paddleKey}` },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.data?.custom_data?.app_user_id ?? null;
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
  const rcKey = process.env.REVENUECAT_SECRET_KEY;
  const entitlement = process.env.RC_ENTITLEMENT_ID || 'pro';

  if (!webhookSecret || !rcKey) {
    // Misconfigured rather than unauthorised. 500 so Paddle retries once the
    // variables are in place, instead of dropping a real purchase.
    console.error('paddle-webhook: PADDLE_WEBHOOK_SECRET or REVENUECAT_SECRET_KEY missing');
    return json(500, { error: 'Not configured' });
  }

  let raw;
  try {
    raw = await request.text();
  } catch (err) {
    console.error('paddle-webhook: could not read body —', err?.message ?? err);
    return json(400, { error: 'Unreadable body' });
  }

  if (!signatureValid(raw, request.headers.get('paddle-signature'), webhookSecret)) {
    console.warn('paddle-webhook: rejected a request with a bad or stale signature');
    return json(401, { error: 'Bad signature' });
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Bad JSON' });
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
        return json(200, { ok: true, skipped: 'no app_user_id' });
      }
      await grant(appUserId, entitlement, rcKey);
      console.log(`paddle-webhook: granted ${entitlement} to ${appUserId} (txn ${data?.id})`);
      return json(200, { ok: true, granted: appUserId });
    }

    if (type === 'adjustment.created' && REVOKING_ACTIONS.has(data?.action)) {
      const appUserId = await appUserIdForTransaction(
        data?.transaction_id,
        process.env.PADDLE_API_KEY,
      );
      if (!appUserId) {
        console.warn(
          `paddle-webhook: ${data?.action} on txn ${data?.transaction_id} not revoked — ` +
            'no app_user_id (set PADDLE_API_KEY to enable refund handling)',
        );
        return json(200, { ok: true, skipped: 'no app_user_id for adjustment' });
      }
      await revoke(appUserId, entitlement, rcKey);
      console.log(`paddle-webhook: revoked ${entitlement} from ${appUserId} (${data?.action})`);
      return json(200, { ok: true, revoked: appUserId });
    }

    // Anything else is fine, just not ours. 200 so Paddle stops retrying.
    return json(200, { ok: true, ignored: type });
  } catch (err) {
    // 500 makes Paddle retry, which is what we want: a transient RevenueCat
    // failure shouldn't cost somebody their unlock.
    console.error('paddle-webhook:', err?.message ?? err);
    return json(500, { error: 'Handler failed' });
  }
}
