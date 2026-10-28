#!/usr/bin/env node
/**
 * Every web sale, and whether it could ever have unlocked anything.
 *
 *   PADDLE_API_KEY=... node scripts/paddle-buyers.mjs [from] [to]
 *   PADDLE_API_KEY=... node scripts/paddle-buyers.mjs 2026-08-27 2026-08-29
 *
 * Reads only, and nothing here can create a record: Paddle's GET endpoints
 * have no side effects, unlike RevenueCat v1's /subscribers, which brings a
 * customer into existence just by being asked about one.
 *
 * Why this exists
 * ---------------
 * The orphan scan finds unlocks sitting on anonymous RevenueCat customers,
 * which is where you end up looking once somebody complains. It can't name
 * them, because an anonymous customer has no email — so an App Store buyer
 * in that state is unreachable until they write in.
 *
 * A web buyer isn't. Paddle took their money and therefore knows who they
 * are, and the transaction still carries the `custom_data.app_user_id` the
 * checkout sent. So the failure is visible from this side, with a name
 * attached, and visible for every sale rather than the ones that complained.
 *
 * What makes a sale bad
 * ---------------------
 * The checkout only sends a Supabase uuid, so anything else means the grant
 * went somewhere nobody can sign in to — or nowhere at all. Both have
 * happened, and both left somebody £49.99 out of pocket and still locked.
 * Since the webhook's uuid gate these are refused loudly instead, but the
 * transactions that predate it are still out there and still need finding.
 */
const PADDLE_API = 'https://api.paddle.com';
const PER_PAGE = 30; // Paddle's maximum.

const key = process.env.PADDLE_API_KEY;
const [from, to] = process.argv.slice(2);

const line = (s = '') => console.log(s);
const head = (s) => { line(); line(`── ${s} ${'─'.repeat(Math.max(0, 58 - s.length))}`); };

if (!key) {
  line('usage: PADDLE_API_KEY=... node scripts/paddle-buyers.mjs [from] [to]');
  line();
  line('  from, to   optional YYYY-MM-DD bounds, inclusive. Omit for every sale.');
  line('  PADDLE_API_KEY   Paddle → Developer tools → Authentication');
  process.exit(1);
}

const SUPABASE_USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let failed = false;

async function paddle(path) {
  const res = await fetch(`${PADDLE_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    failed = true;
    const body = await res.text().catch(() => '');
    line(`  Paddle said ${res.status}: ${body.slice(0, 200)}`);
    return null;
  }
  return res.json();
}

// ── Every completed transaction, oldest first ────────────────────────────
// Paddle's date filters are easy to get subtly wrong and a wrong filter here
// silently hides the sale you are hunting, so the whole (small) list comes
// down and the window is applied locally where it can be read.
head('Paddle transactions');
const txns = [];
let after = null;
for (;;) {
  const page = await paddle(
    `/transactions?status=completed&per_page=${PER_PAGE}&include=customer` +
      (after ? `&after=${encodeURIComponent(after)}` : ''),
  );
  if (!page) break;
  const items = page.data ?? [];
  txns.push(...items);
  if (!page.meta?.pagination?.has_more || items.length === 0) break;
  after = items[items.length - 1].id;
}

const when = (t) => (t.billed_at ?? t.created_at ?? '').slice(0, 10);
const inWindow = (t) => {
  const d = when(t);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};
const rows = txns.filter(inWindow).sort((a, b) => when(a).localeCompare(when(b)));

line(`${txns.length} completed sales${from || to ? `, ${rows.length} in the window` : ''}.`);

const money = (t) => {
  const total = t.details?.totals?.grand_total;
  if (total === undefined || total === null) return '';
  return `${(Number(total) / 100).toFixed(2)} ${t.currency_code ?? ''}`.trim();
};

const broken = [];
head(from || to ? `Sales ${from ?? 'start'} → ${to ?? 'now'}` : 'All sales');
for (const t of rows) {
  const raw = t.custom_data?.app_user_id;
  const ok = typeof raw === 'string' && SUPABASE_USER_ID.test(raw.trim());
  const email = t.customer?.email ?? `(customer ${t.customer_id})`;
  line(`  ${when(t)}  ${email}`);
  line(`    ${t.id}  ${money(t)}`);
  line(`    app_user_id: ${ok ? raw.trim() : `${JSON.stringify(raw) ?? 'absent'}  ← UNUSABLE`}`);
  if (!ok) broken.push({ ...t, email });
}
if (rows.length === 0) line('  None.');

head('Sales that could never have unlocked anything');
if (broken.length === 0) {
  line(failed ? 'None found, but at least one request failed — see above.' : 'None.');
} else {
  line(`${broken.length} buyer${broken.length === 1 ? '' : 's'} paid and got nothing:`);
  line();
  for (const b of broken) {
    line(`  ${b.email}   ${when(b)}   ${b.id}   ${money(b)}`);
  }
  line();
  line('To put each one right:');
  line('  1. Find their Supabase user id (Authentication → Users, by email).');
  line('  2. RevenueCat → Customers → that uuid → Grant entitlement → Lifetime.');
  line('  3. If they have no account yet, ask them to open V-Tune and sign in');
  line('     once with this address, then grant against the uuid that appears.');
}

head('Verdict');
if (failed) {
  line('INCOMPLETE — a request failed, so this is a floor, not a total.');
  process.exitCode = 2;
} else {
  line(`Checked ${rows.length} sales.`);
}
