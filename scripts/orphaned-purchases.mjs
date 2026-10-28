#!/usr/bin/env node
/**
 * "Who else paid but can't sign in to it?" — the cohort version of whodunnit.
 *
 *   RC_PROJECT_ID=projXXXX \
 *   REVENUECAT_SECRET_KEY_V2=... \      # lists customers (v2 key)
 *   REVENUECAT_SECRET_KEY=... \         # optional, adds detail (v1 key)
 *     node scripts/orphaned-purchases.mjs
 *
 * Reads only, and unlike whodunnit that is literally true: every endpoint
 * here is a GET that cannot bring a record into existence. (v1's
 * /subscribers creates the subscriber if it isn't there, which is how a
 * stray `claude-diagnostic-test` customer can end up in the dashboard.)
 *
 * What it looks for
 * -----------------
 * Nothing in the app asks you to sign in before you buy, so a store purchase
 * made while signed out attaches to an ANONYMOUS RevenueCat customer
 * ($RCAnonymousID:…) with no email and no link to Supabase. That device
 * works perfectly. Every other device looks up the Supabase user id, finds a
 * customer who has never bought anything, and tells somebody who paid us
 * that they haven't.
 *
 * Why two keys
 * ------------
 * RevenueCat API keys are version-locked in both directions: a v1 key is
 * refused by v2 ("legacy API key"), and a v2 key is refused by v1 (code
 * 7723). Only v2 can enumerate customers, so the v2 key is required. The v1
 * key is optional and only adds store/product/date detail — without it you
 * still get the count and the ids, which is what you act on.
 *
 * V-Tune Pro is a NON-CONSUMABLE, so on v1 a store purchase lands in
 * `non_subscriptions`, never `subscriptions`.
 */
const RC_V1 = 'https://api.revenuecat.com/v1';
const RC_V2 = 'https://api.revenuecat.com/v2';
const ENTITLEMENT = process.env.RC_ENTITLEMENT_ID || 'pro';
const PAGE_LIMIT = 100;
const CONCURRENCY = 4;

const keyV2 = process.env.REVENUECAT_SECRET_KEY_V2;
const keyV1 = process.env.REVENUECAT_SECRET_KEY;
const projectId = process.env.RC_PROJECT_ID;

const line = (s = '') => console.log(s);
const head = (s) => { line(); line(`── ${s} ${'─'.repeat(Math.max(0, 58 - s.length))}`); };
const day = (v) => {
  if (!v) return '—';
  const d = new Date(typeof v === 'number' ? v : v);
  return isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
};

if (!keyV2 || !projectId) {
  line('Needs, at minimum:');
  line('  RC_PROJECT_ID             the projXXXX in your dashboard URL');
  line('  REVENUECAT_SECRET_KEY_V2  Project settings → API keys → + New,');
  line('                            Version: V2, Customer information: read');
  line();
  line('Optional, for store/product/purchase-date detail:');
  line('  REVENUECAT_SECRET_KEY     your existing v1 secret key');
  process.exit(1);
}

/** Any lookup that errored. If true, absence of evidence is not evidence. */
let failed = false;
/** Errors collapsed by message, so one broken key can't bury the report. */
const problems = new Map();
function note(message, id) {
  failed = true;
  const entry = problems.get(message) ?? { count: 0, examples: [] };
  entry.count += 1;
  if (entry.examples.length < 3) entry.examples.push(id);
  problems.set(message, entry);
}

async function get(url, key, id) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let message = `${res.status}`;
    try {
      message = `${res.status} ${JSON.parse(body).message ?? ''}`.trim();
    } catch {
      message = `${res.status} ${body}`.slice(0, 160).trim();
    }
    note(message, id);
    return null;
  }
  return res.json();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An id that is not a Supabase user id — so not reachable by signing in. */
const isAccountless = (id) => !UUID.test(id);

// ── Enumerate every customer in the project ──────────────────────────────
head('RevenueCat customers');
// Ask for entitlements inline. If the list honours it we never need a second
// call per customer, which on a project this size is the difference between
// one request and four hundred.
const listUrl = (cursor) =>
  `${RC_V2}/projects/${projectId}/customers?limit=${PAGE_LIMIT}` +
  `&expand[]=active_entitlements${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`;

const customers = [];
let cursor = null;
for (;;) {
  const page = await get(listUrl(cursor), keyV2, 'customer list');
  if (!page) {
    line('Could not list customers — see "Could not check" below.');
    break;
  }
  const items = page.items ?? [];
  customers.push(...items);
  const last = items[items.length - 1];
  if (!page.next_page || items.length < PAGE_LIMIT || !last) break;
  cursor = last.id;
}

const accountless = customers.filter((c) => isAccountless(c.id));
// A tally of zero reads like a finding. Say nothing rather than report a
// breakdown of a list we never managed to fetch.
if (customers.length > 0) {
  line(`Scanned ${customers.length} customers.`);
  line(`${customers.length - accountless.length} are attached to an account (Supabase user id).`);
  line(`${accountless.length} are anonymous.`);
}

/** Entitlements from the expanded list, when the list gave us any. */
function expandedEntitlement(customer) {
  const items = customer.active_entitlements?.items;
  if (!Array.isArray(items)) return undefined; // not expanded — caller falls back
  return items.some((e) => e.entitlement_id === ENTITLEMENT);
}

const expandWorked = customers.some((c) => expandedEntitlement(c) !== undefined);
if (customers.length > 0) {
  line(
    expandWorked
      ? 'Entitlements came back with the list — no per-customer lookups needed.'
      : keyV1
        ? 'The list carries no entitlements; falling back to per-customer v1 lookups.'
        : 'The list carries no entitlements, and no v1 key was supplied.',
  );
}

// ── Which of the accountless ones actually own the entitlement? ──────────
async function detail(id) {
  if (!keyV1) return {};
  const data = await get(`${RC_V1}/subscribers/${encodeURIComponent(id)}`, keyV1, id);
  const sub = data?.subscriber;
  if (!sub) return {};
  const ent = sub.entitlements?.[ENTITLEMENT];
  const oneOff = Object.entries(sub.non_subscriptions ?? {})
    .flatMap(([product, buys]) => (buys ?? []).map((b) => ({ product, ...b })))
    .sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date))[0];
  return {
    entitled: Boolean(ent) && !(ent.expires_date && new Date(ent.expires_date) <= new Date()),
    product: oneOff?.product ?? ent?.product_identifier ?? '—',
    store: oneOff?.store ?? 'promotional/unknown',
    boughtAt: day(oneOff?.purchase_date ?? ent?.purchase_date),
    lastSeen: day(sub.last_seen),
    email: sub.subscriber_attributes?.$email?.value ?? null,
  };
}

const orphans = [];
const candidates = expandWorked
  ? accountless.filter((c) => expandedEntitlement(c) === true)
  : accountless;

if (!expandWorked && !keyV1) {
  // Nothing can answer the entitlement question. Say so instead of looping —
  // but not when the list itself failed, where it is a consequence rather
  // than a second problem, and only clutters the report.
  if (customers.length > 0) {
    note('no way to read entitlements: list did not expand them and no v1 key given', '—');
  }
} else {
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      candidates.slice(i, i + CONCURRENCY).map(async (c) => {
        const d = await detail(c.id);
        // Trust the expanded list when we have it; otherwise v1 decides.
        const entitled = expandWorked ? true : d.entitled === true;
        return entitled ? { id: c.id, ...d } : null;
      }),
    );
    orphans.push(...batch.filter(Boolean));
  }
}

// ── The other half of the picture ────────────────────────────────────────
// An anonymous row is only a stranded customer if the same purchase is not
// ALSO sitting on their account. The Paddle webhook grants against the
// Supabase id from custom_data, while RevenueCat separately ingests the raw
// Paddle transaction — which can leave one buyer holding two records, one
// working and one a ghost. Counting the anonymous side alone cannot tell
// those apart, and reporting a ghost as a stranded customer would send you
// chasing people who are perfectly fine.
const attached = customers.filter((c) => !isAccountless(c.id));
const attachedEntitled = [];
for (let i = 0; i < attached.length; i += CONCURRENCY) {
  const batch = await Promise.all(
    attached.slice(i, i + CONCURRENCY).map(async (c) => {
      const d = await detail(c.id);
      const entitled = expandWorked ? expandedEntitlement(c) === true : d.entitled === true;
      return entitled ? { id: c.id, ...d } : null;
    }),
  );
  attachedEntitled.push(...batch.filter(Boolean));
}

head('Unlocked AND attached to an account (these people are fine)');
if (attachedEntitled.length === 0) {
  line('None.');
} else {
  line(`${attachedEntitled.length} working unlock${attachedEntitled.length === 1 ? '' : 's'}.`);
  for (const a of attachedEntitled) {
    line(`  ${a.id}`);
    if (a.store) line(`    ${a.store}  ${a.product}  bought ${a.boughtAt}`);
    if (a.email) line(`    ${a.email}`);
  }
}

/**
 * Find the account-side grant that this anonymous row is a shadow of.
 *
 * Matched on the day, because that is the only field the two sides share:
 * the anonymous row carries Paddle's transaction date and the account row
 * carries the moment our webhook granted, and those are the same purchase
 * seconds apart. A day either side absorbs a purchase near midnight.
 *
 * Deliberately a hint, never a filter. A wrong match here would hide
 * somebody who really is locked out, so an unmatched row is called out and
 * a matched one is only ever described as likely.
 */
const twinPool = [...attachedEntitled];
function takeAccountTwin(orphan) {
  if (orphan.store !== 'paddle' || orphan.boughtAt === '—') return null;
  const when = new Date(orphan.boughtAt).getTime();
  // Closest day wins, and each account is claimable once. Taking the first
  // within range instead let one account stand in for two anonymous rows —
  // which quietly reclassified somebody genuinely locked out as a duplicate
  // of a purchase that was not theirs.
  let best = -1;
  let bestDelta = Infinity;
  twinPool.forEach((a, i) => {
    if (a.boughtAt === '—') return;
    const delta = Math.abs(new Date(a.boughtAt).getTime() - when);
    if (delta <= 86_400_000 && delta < bestDelta) {
      best = i;
      bestDelta = delta;
    }
  });
  return best < 0 ? null : twinPool.splice(best, 1)[0];
}
const twinned = [];
const lonely = [];
// Oldest first, so the pairing is stable run to run rather than dependent on
// whatever order RevenueCat happened to page the customers out in.
for (const o of [...orphans].sort((a, b) => a.boughtAt.localeCompare(b.boughtAt))) {
  const twin = takeAccountTwin(o);
  (twin ? twinned : lonely).push({ ...o, twin });
}

head('Paid, but not attached to an account');
if (failed && customers.length === 0) {
  line('NOTHING WAS CHECKED — the customer list could not be read (see below).');
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
  for (const o of [...lonely, ...twinned]) {
    line(`  ${o.id}`);
    if (o.store) line(`    ${o.store}  ${o.product}  bought ${o.boughtAt}  last seen ${o.lastSeen}`);
    if (o.email) line(`    email on file: ${o.email}`);
    if (o.twin) {
      line(`    ↳ likely a duplicate of ${o.twin.email ?? o.twin.id} — already unlocked`);
    } else {
      line('    ↳ NO ACCOUNT TWIN — treat as genuinely locked out');
    }
  }
  line();
  line(`${lonely.length} of ${orphans.length} have no working account-side unlock.`);
  line();
  if (twinned.length) {
    line(`${twinned.length} of these are almost certainly duplicates: a Paddle purchase`);
    line('RevenueCat ingested on its own, beside the grant our webhook already');
    line('put on the buyer\'s account the same day. Those people are unlocked.');
  }
  line();
  line('Fix, in order of preference:');
  line('  1. Ask them to open V-Tune ON THE DEVICE THEY BOUGHT ON and use');
  line('     Settings → V-Tune Pro → Save it (1.3.7 and later). Signing in');
  line('     there moves the purchase onto their account, and it then');
  line('     follows them to every device.');
  line('  2. If they can no longer reach that device, grant a promotional');
  line('     entitlement to their Supabase user id in the RevenueCat');
  line('     dashboard (Customer → Grant entitlement → Lifetime).');
}

if (problems.size) {
  head('Could not check');
  for (const [message, { count, examples }] of problems) {
    line(`  ${count}× ${message}`);
    line(`     e.g. ${examples.join(', ')}`);
  }
}

head('Verdict');
if (failed) {
  line('INCOMPLETE — at least one lookup failed, so this is a floor, not a total.');
  line('Do not read a low number here as "nobody is affected".');
  process.exitCode = 2;
} else {
  line(`Complete scan of ${customers.length} customers.`);
}
