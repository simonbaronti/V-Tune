#!/usr/bin/env node
/**
 * The Paddle webhook's refund logic, exercised across the whole adjustment
 * lifecycle.
 *
 *   npm run test:webhook
 *
 * Deliberately lives in scripts/ and not in landing/api/: anything under
 * api/ is deployed as a serverless function, and a test file answering at a
 * public URL is not what anybody wants.
 *
 * Both outside services are stubbed through global fetch, so this makes no
 * network calls and needs no keys. The request is signed for real, so the
 * signature path is covered too.
 *
 * What it is guarding: a refund is created as `pending_approval` and only
 * becomes `approved` when Paddle decides, which arrives as a separate
 * `adjustment.updated`. Acting on creation revoked people's unlocks the
 * moment a refund was asked for — before any money moved, and even when
 * Paddle went on to refuse it.
 */
import crypto from 'node:crypto';
import handler from '../landing/api/paddle-webhook.mjs';

const SECRET = 'pdl_ntfset_test_secret_value';
process.env.PADDLE_WEBHOOK_SECRET = SECRET;
process.env.REVENUECAT_SECRET_KEY = 'sk_test';
process.env.PADDLE_API_KEY = 'pdl_live_test';

const TXN = 'txn_test123';
const APP_USER = 'user-uuid-1';
const TXN_TOTAL = '4999';           // £49.99 in minor units

let rcCalls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.paddle.com/transactions/')) {
    return { ok: true, json: async () => ({ data: {
      custom_data: { app_user_id: APP_USER },
      details: { totals: { total: TXN_TOTAL } },
    }})};
  }
  if (u.includes('api.revenuecat.com')) {
    rcCalls.push((opts.method || 'GET') + ' ' + u.split('/v1')[1]);
    return { ok: true, json: async () => ({}) };
  }
  throw new Error('unexpected fetch ' + u);
};

const logs = [];
for (const m of ['log','warn','error']) {
  const orig = console[m];
  console[m] = (...a) => { logs.push(a.join(' ')); };
}

async function fire(event_type, data) {
  rcCalls = [];
  const body = JSON.stringify({ event_type, data });
  const ts = Math.floor(Date.now() / 1000);
  const h1 = crypto.createHmac('sha256', SECRET).update(`${ts}:${body}`).digest('hex');
  const req = { method: 'POST', headers: { 'paddle-signature': `ts=${ts};h1=${h1}` }, body };
  let out;
  const res = { status: () => ({ json: (j) => { out = j; } }), setHeader(){} };
  await handler(req, res);
  const action = rcCalls.some(c => c.includes('revoke_promotionals')) ? 'REVOKE'
             : rcCalls.some(c => c.includes('promotional')) ? 'GRANT'
             : 'none';
  return { out, action };
}

const adj = (o) => ({ id:'adj_1', action:'refund', status:'pending_approval',
                      transaction_id:TXN, totals:{ total:TXN_TOTAL }, ...o });

const cases = [
  ['refund requested (created, pending_approval)', 'adjustment.created', adj({}),                                 'none'],
  ['refund REJECTED (updated)',                    'adjustment.updated', adj({status:'rejected'}),                'none'],
  ['refund APPROVED (updated)',                    'adjustment.updated', adj({status:'approved'}),                'REVOKE'],
  ['refund auto-approved on create',               'adjustment.created', adj({status:'approved'}),                'REVOKE'],
  ['PARTIAL refund approved',                      'adjustment.updated', adj({status:'approved', totals:{total:'1000'}}), 'none'],
  ['chargeback approved',                          'adjustment.created', adj({action:'chargeback', status:'approved'}),   'REVOKE'],
  ['chargeback_warning',                           'adjustment.created', adj({action:'chargeback_warning', status:'approved'}), 'none'],
  ['credit',                                       'adjustment.created', adj({action:'credit', status:'approved'}),  'none'],
  ['chargeback REVERSED (we won)',                 'adjustment.updated', adj({action:'chargeback', status:'reversed'}), 'GRANT'],
  ['chargeback_reverse adjustment raised',         'adjustment.created', adj({action:'chargeback_reverse', status:'approved'}), 'GRANT'],
  ['a normal sale',                                'transaction.completed', { id:TXN, custom_data:{ app_user_id:APP_USER } }, 'GRANT'],
];

let pass = 0, fail = 0;
const rows = [];
for (const [name, type, data, expect] of cases) {
  const { action } = await fire(type, data);
  const ok = action === expect;
  ok ? pass++ : fail++;
  rows.push(`  ${ok ? '✓' : '✗'} ${name.padEnd(42)} -> ${action.padEnd(6)} (expected ${expect})`);
}
for (const m of ['log','warn','error']) console[m] = (...a) => process.stdout.write(a.join(' ') + '\n');
console.log(rows.join('\n'));
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
