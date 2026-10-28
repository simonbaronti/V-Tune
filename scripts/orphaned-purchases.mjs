#!/usr/bin/env node
/**
 * "Who else paid but can't unlock?" — the cohort version of whodunnit.
 *
 *   REVENUECAT_SECRET_KEY=... RC_PROJECT_ID=... node scripts/orphaned-purchases.mjs
 *
 * Reads only. Nothing is granted, revoked or changed.
 *
 * What it looks for
 * -----------------
 * Nothing in the app asks you to sign in before you buy. Tap Unlock on an
 * iPhone or iPad while signed out and the App Store receipt attaches to an
 * ANONYMOUS RevenueCat customer ($RCAnonymousID:…) — a customer with no
 * email, no account, and no connection to Supabase.
 *
 * On that device it works perfectly, which is why nobody notices. Signing in
 * on the same device fixes it silently too: logIn() aliases the anonymous
 * customer onto the account and the purchase comes with it.
 *
 * It only surfaces when they pick up a second device. There the app looks up
 * their Supabase user id, finds a customer who has never bought anything,
 * and tells someone who paid us that they haven't. That is the population
 * this script counts.
 *
 * Why the two-step lookup
 * -----------------------
 * The v2 customers list does not reliably populate active_entitlements, so
 * membership is confirmed per customer against v1 /subscribers. We only pay
 * for that call on the non-account ids, which is the small end of the list.
 *
 * V-Tune Pro is a NON-CONSUMABLE, so a store purchase lands in
 * `non_subscriptions`, not `subscriptions`. Reading only the latter would
 * report zero for ever.
 */
const RC_V1 = 'https://api.revenuecat.com/v1';
const RC_V2 = 'https://api.revenuecat.com/v2';
const ENTITLEMENT = process.env.RC_ENTITLEMENT_ID || 'pro';
const PAGE_LIMIT = 100;
const CONCURRENCY = 4;

const rcKey = process.env.REVENUECAT_SECRET_KEY;
const projectId = process.env.RC_PROJECT_ID;

const line = (s = '') => console.log(s);
const head = (s) => { line(); line(`── ${s} ${'─'.repeat(Math.max(0, 58 - s.length))}`); };
const day = (v) => (v ? new Date(typeof v === 'number' ? v : v).toISOString().slice(0, 10) : '—');

if (!rcKey || !projectId) {
  line('Needs both of these:');
  line('  REVENUECAT_SECRET_KEY  RevenueCat → Project settings → API keys → Secret');
  line('  RC_PROJECT_ID          the projXXXX in the dashboard URL');
  process.exit(1);
}

/** Any lookup that errored. If true, absence of evidence is not evidence. */
let failed = false;

async function rc(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${rcKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    failed = true;
    return { __error: `${res.status} ${await res.text().catch(() => '')}`.slice(0, 200) };
  }
  return res.json();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An id that is not a Supabase user id — so not reachable by signing in. */
const isAccountless = (id) => !UUID.test(id);

// ── Enumerate every customer in the project ──────────────────────────────
head('RevenueCat customers');
const customers = [];
let next = `${RC_V2}/projects/${projectId}/customers?limit=${PAGE_LIMIT}`;
while (next) {
  const page = await rc(next);
  if (page.__error) {
    line(`Could not list customers: ${page.__error}`);
    if (/401|403/.test(page.__error)) {
      line('A v1-only secret key will do this. Create one under the v2 API keys');
      line('section with customer_information:customers:read.');
    }
    break;
  }
  for (const c of page.items ?? []) customers.push(c);
  // Forward-only pagination: the last item's id is the cursor.
  const last = page.items?.[page.items.length - 1];
  next = page.next_page
    ? (page.next_page.startsWith('http') ? page.next_page : `${RC_V2}${page.next_page}`)
    : (page.items?.length === PAGE_LIMIT && last
        ? `${RC_V2}/projects/${projectId}/customers?limit=${PAGE_LIMIT}&starting_after=${encodeURIComponent(last.id)}`
        : null);
}
const accountless = customers.filter((c) => isAccountless(c.id));
// A tally of zero reads like a finding. Say nothing rather than report a
// breakdown of a list we never managed to fetch.
if (customers.length > 0) {
  line(`Scanned ${customers.length} customers.`);
  line(`${customers.length - accountless.length} are attached to an account (Supabase user id).`);
  line(`${accountless.length} are anonymous — checking which of those have paid.`);
}

// ── Which of the accountless ones actually own the entitlement? ──────────
async function inspect(id) {
  const data = await rc(`${RC_V1}/subscribers/${encodeURIComponent(id)}`);
  if (data.__error) return { id, error: data.__error };
  const sub = data.subscriber ?? {};
  const ent = sub.entitlements?.[ENTITLEMENT];
  if (!ent) return null;
  const expired = ent.expires_date && new Date(ent.expires_date) <= new Date();
  if (expired) return null;
  // A one-time unlock lives in non_subscriptions, keyed by product id.
  const oneOff = Object.entries(sub.non_subscriptions ?? {})
    .flatMap(([product, buys]) => (buys ?? []).map((b) => ({ product, ...b })))
    .sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date))[0];
  return {
    id,
    product: oneOff?.product ?? ent.product_identifier ?? '—',
    store: oneOff?.store ?? 'promotional/unknown',
    boughtAt: day(oneOff?.purchase_date ?? ent.purchase_date),
    lastSeen: day(sub.last_seen),
    email: sub.subscriber_attributes?.$email?.value ?? null,
  };
}

const orphans = [];
const errors = [];
for (let i = 0; i < accountless.length; i += CONCURRENCY) {
  const batch = await Promise.all(accountless.slice(i, i + CONCURRENCY).map((c) => inspect(c.id)));
  for (const r of batch) {
    if (!r) continue;
    if (r.error) errors.push(r);
    else orphans.push(r);
  }
}

head('Paid, but not attached to an account');
// "None" has to mean none, not "the lookup fell over before it counted any".
// A reassuring sentence printed over a failed scan is worse than no scan:
// it is the one line somebody quotes back a fortnight later.
if (failed && customers.length === 0) {
  line('NOTHING WAS CHECKED — the customer list could not be read (see above).');
  line('This is not a result. Fix the error and run it again.');
} else if (orphans.length === 0) {
  line(
    failed
      ? 'None among the customers that could be read — but the scan was incomplete.'
      : 'None. Every unlock we can see belongs to an account.',
  );
} else {
  line(`${orphans.length} ${orphans.length === 1 ? 'person has' : 'people have'} an active "${ENTITLEMENT}" unlock on an anonymous customer.`);
  line('They can tune on the device they bought on. On any OTHER device,');
  line('signing in tells them this account has not bought V-Tune.');
  line();
  for (const o of orphans) {
    line(`  ${o.id}`);
    line(`    ${o.store}  ${o.product}  bought ${o.boughtAt}  last seen ${o.lastSeen}`);
    if (o.email) line(`    email on file: ${o.email}`);
  }
  line();
  line('Fix, in order of preference:');
  line('  1. Ask them to sign in ON THE DEVICE THEY BOUGHT ON, then tap');
  line('     Restore purchase. logIn() aliases the anonymous customer onto');
  line('     their account and the unlock follows them to every device.');
  line('  2. If they can no longer reach that device, grant a promotional');
  line('     entitlement to their Supabase user id in the RevenueCat');
  line('     dashboard (Customer → Grant entitlement → Lifetime).');
}

if (errors.length) {
  head('Could not check');
  for (const e of errors) line(`  ${e.id}: ${e.error}`);
}

head('Verdict');
if (failed) {
  line('INCOMPLETE — at least one lookup failed, so this is a floor, not a total.');
  line('Do not read a low number here as "nobody is affected".');
  process.exitCode = 2;
} else {
  line(`Complete scan of ${customers.length} customers.`);
}
