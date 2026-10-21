#!/usr/bin/env node
/**
 * "They say they paid, the app says they haven't." — answer it in one go.
 *
 *   REVENUECAT_SECRET_KEY=... PADDLE_API_KEY=... \
 *     node scripts/whodunnit.mjs they@example.com [supabase-uuid]
 *
 * Reads only. Nothing is granted, revoked or changed — it tells you what
 * each system believes, and where the two disagree.
 *
 * The disagreement is nearly always one of four things:
 *   1. Paddle took money but the webhook never granted — custom_data had no
 *      app_user_id, so there was nobody to attach the unlock to. The webhook
 *      logs "transaction.completed with no app_user_id" when this happens.
 *   2. They bought in the iOS/Android app while signed OUT. The store
 *      purchase attached to an anonymous RevenueCat customer, and signing in
 *      later looks up a different id entirely.
 *   3. They paid against Paddle SANDBOX (?checkout=test) — a test card, no
 *      real money, and since 1.3.5 the webhook deliberately refuses those.
 *   4. They are signing in with a different address from the one they paid
 *      with.
 */
const RC_API = 'https://api.revenuecat.com/v1';
const PADDLE_API = 'https://api.paddle.com';
const ENTITLEMENT = process.env.RC_ENTITLEMENT_ID || 'pro';

const [email, appUserId] = process.argv.slice(2);
if (!email) {
  console.error('usage: node scripts/whodunnit.mjs <email> [supabase-uuid]');
  process.exit(1);
}
const rcKey = process.env.REVENUECAT_SECRET_KEY;
const paddleKey = process.env.PADDLE_API_KEY;

const money = (minor, cur) => `${(Number(minor) / 100).toFixed(2)} ${cur ?? ''}`.trim();
const line = (s = '') => console.log(s);
const head = (s) => { line(); line(`── ${s} ${'─'.repeat(Math.max(0, 58 - s.length))}`); };

async function rc(path) {
  const res = await fetch(`${RC_API}${path}`, {
    headers: { Authorization: `Bearer ${rcKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return { __error: `${res.status} ${await res.text().catch(() => '')}`.slice(0, 200) };
  return res.json();
}

async function paddle(path) {
  const res = await fetch(`${PADDLE_API}${path}`, {
    headers: { Authorization: `Bearer ${paddleKey}` },
  });
  if (!res.ok) return { __error: `${res.status} ${await res.text().catch(() => '')}`.slice(0, 200) };
  return res.json();
}

const verdicts = [];
/** Any lookup that errored. If true, absence of evidence is not evidence. */
let failed = false;

// ── RevenueCat: does the unlock exist, and on whom? ───────────────────────
head('RevenueCat');
if (!rcKey) {
  line('REVENUECAT_SECRET_KEY not set — skipped.');
} else if (!appUserId) {
  line('No Supabase uuid given, so there is nothing to look up by.');
  line('RevenueCat has no search-by-email API; find them in the dashboard');
  line('and pass their App User ID as the second argument.');
} else {
  const sub = await rc(`/subscribers/${encodeURIComponent(appUserId)}`);
  if (sub.__error) {
    line(`lookup FAILED: ${sub.__error}`);
    verdicts.push(`RevenueCat could not be reached or the key was rejected — this run says nothing about whether the unlock exists.`);
    failed = true;
  } else {
    const s = sub.subscriber ?? {};
    const ents = s.entitlements ?? {};
    const ent = ents[ENTITLEMENT];
    line(`app_user_id      ${appUserId}`);
    line(`first seen       ${s.first_seen ?? '?'}`);
    line(`RC email attr    ${s.subscriber_attributes?.$email?.value ?? '(none set)'}`);
    line(`original app id  ${s.original_app_user_id ?? '?'}`);
    const aliases = sub.subscriber?.aliases ?? [];
    if (aliases.length > 1) line(`aliases          ${aliases.join(', ')}`);
    line(`entitlements     ${Object.keys(ents).join(', ') || '(none)'}`);
    if (ent) {
      const live = !ent.expires_date || new Date(ent.expires_date) > new Date();
      line(`  ${ENTITLEMENT}: ${live ? 'ACTIVE' : 'EXPIRED'}  granted ${ent.purchase_date}` +
           `  expires ${ent.expires_date ?? 'never'}  via ${ent.product_identifier ?? '?'}`);
      verdicts.push(live
        ? `RevenueCat HAS an active "${ENTITLEMENT}" on ${appUserId} — if the app still says otherwise, it is a client-side problem, not a missing grant.`
        : `RevenueCat has "${ENTITLEMENT}" but it is EXPIRED.`);
    } else {
      verdicts.push(`RevenueCat has NO "${ENTITLEMENT}" on ${appUserId}. Nothing was ever granted to this id.`);
    }
    const ns = Object.keys(s.non_subscriptions ?? {});
    const subs = Object.keys(s.subscriptions ?? {});
    line(`store purchases  ${[...ns, ...subs].join(', ') || '(none — so no App Store / Play purchase landed here)'}`);
  }
}

// ── Paddle: did money actually move? ──────────────────────────────────────
head('Paddle');
if (!paddleKey) {
  line('PADDLE_API_KEY not set — skipped.');
} else {
  // status defaults to `active`, so an archived customer would simply not
  // appear — which would read as "they never paid". Ask for both.
  const cust = await paddle(
    `/customers?email=${encodeURIComponent(email)}&status=active,archived`,
  );
  if (cust.__error) {
    // A failed lookup is NOT an answer. Saying "never paid" here because the
    // request errored is how you end up telling someone who did pay that
    // they didn't.
    line(`customer lookup FAILED: ${cust.__error}`);
    verdicts.push(`Paddle could not be reached or the key was rejected — this run proves NOTHING about whether they paid. Fix the key and run again.`);
    failed = true;
  }
  const found = cust.__error ? [] : (cust.data ?? []);
  if (!cust.__error && !found.length) {
    line(`No Paddle customer with ${email}.`);
    verdicts.push(`Paddle has never seen ${email}. Either they paid with a DIFFERENT address, or they bought through the App Store / Play rather than the website, or no payment was taken at all.`);
  }
  for (const c of found) {
    line(`customer ${c.id}  ${c.email}  status=${c.status}  created ${c.created_at}`);
    // 30 is the documented maximum for this endpoint.
    const txns = await paddle(`/transactions?customer_id=${encodeURIComponent(c.id)}&per_page=30`);
    const list = txns.__error ? [] : (txns.data ?? []);
    if (txns.__error) {
      line(`  transaction lookup FAILED: ${txns.__error}`);
      verdicts.push(`Found the Paddle customer but could not list their transactions — nothing here rules a payment in or out.`);
      failed = true;
    } else if (!list.length) {
      line('  no transactions');
    }
    for (const t of list) {
      const total = t.details?.totals?.total;
      const cur = t.currency_code;
      const appUid = t.custom_data?.app_user_id ?? null;
      line(`  ${t.id}  ${t.status.padEnd(10)} ${money(total, cur).padStart(12)}  ${t.created_at?.slice(0, 10)}`);
      line(`      custom_data.app_user_id: ${appUid ?? '*** MISSING ***'}`);
      if (t.status === 'completed' && !appUid) {
        verdicts.push(`Transaction ${t.id} COMPLETED with no app_user_id — the webhook had nobody to grant to. This is a paid-for-nothing. Grant it by hand.`);
      }
      if (t.status === 'completed' && appUid && appUserId && appUid !== appUserId) {
        verdicts.push(`Transaction ${t.id} was attached to app_user_id ${appUid}, NOT the ${appUserId} they sign in as. The unlock is sitting on the wrong account.`);
      }
      if (t.status === 'completed' && appUid && appUid === appUserId) {
        verdicts.push(`Transaction ${t.id} paid ${money(total, cur)} and carried the right app_user_id — so the webhook should have granted. If RevenueCat shows nothing, the webhook call failed or never arrived.`);
      }
    }
  }
}

head('What this means');
if (!verdicts.length) line('Nothing conclusive — check the arguments and the keys.');
verdicts.forEach((v, i) => line(`${i + 1}. ${v}`));
if (failed) {
  line();
  line('⚠  At least one lookup failed, so this report is INCOMPLETE.');
  line('   Do not conclude anything about this customer from it.');
}
line();
line('To put it right once you know: grant the entitlement to the id they');
line('actually sign in as, from RevenueCat → Customer → Grant entitlement');
line(`→ "${ENTITLEMENT}" → Lifetime. That is exactly what the webhook does.`);
line();
