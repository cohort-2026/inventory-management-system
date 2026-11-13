#!/usr/bin/env node
/* F00 read-only / rejected-write smoke checks. Node 20+. No database writes expected. */
'use strict';
const BASE = (process.env.IMS_TEST_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const checks = [];
let failures = 0;
const assert = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};
async function call(path, method = 'GET', payload, cookie = '') {
  const headers = { Accept: 'application/json' };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE}${path}`, {
    method, headers, redirect: 'manual',
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    signal: AbortSignal.timeout(12000)
  });
  return { status: response.status, response, data: await response.text() };
}
function extractCookie(response) {
  const cookies = response.headers.getSetCookie?.() || [];
  const match = cookies.find(s => s.startsWith('ims_custom_session='));
  return match ? match.split(';', 1)[0] : '';
}
async function login(prefix) {
  const email = process.env[`IMS_${prefix}_EMAIL`];
  const password = process.env[`IMS_${prefix}_PASSWORD`];
  if (!email || !password) {
    console.log(`SKIP ${prefix} role-specific checks (set IMS_${prefix}_EMAIL and IMS_${prefix}_PASSWORD)`);
    return '';
  }
  const result = await call('/api/custom-auth/login', 'POST', { email, password });
  const cookie = extractCookie(result.response);
  assert(`${prefix} login`, result.status === 200 && Boolean(cookie), `HTTP ${result.status}`);
  if (!cookie) return '';
  const me = await call('/api/custom-auth/me', 'GET', undefined, cookie);
  let role = '';
  try { role = JSON.parse(me.data).user.roleName; } catch (_) {}
  const wanted = prefix === 'STAFF' ? 'Inventory Staff' : prefix === 'MANAGER' ? 'Manager' : 'Viewer';
  assert(`${prefix} /me role`, me.status === 200 && role === wanted, `HTTP ${me.status}, role=${role}`);
  return cookie;
}
async function main() {
  console.log(`F00 smoke tests against ${BASE} — only local/disposable database recommended`);
  const health = await call('/health');
  assert('Health', health.status === 200, `HTTP ${health.status}`);
  const unauth = await call('/api/inventory');
  assert('Inventory requires login', unauth.status === 401, `HTTP ${unauth.status}`);
  const unauthMovement = await call('/api/stock-movements');
  assert('Movement history requires login', unauthMovement.status === 401, `HTTP ${unauthMovement.status}`);
  const unauthWrite = await call('/api/inventory/adjustments', 'POST', {});
  assert('Adjustment requires login', unauthWrite.status === 401, `HTTP ${unauthWrite.status}`);
  const unauthCount = await call('/api/inventory/counts', 'POST', {});
  assert('Count creation requires login', unauthCount.status === 401, `HTTP ${unauthCount.status}`);
  if (process.env.IMS_EXPECT_PUBLIC_REGISTRATION_BLOCKED === 'YES') {
    // Intentional invalid payload: must be denied by registration gate before validation or DB writes.
    const reg = await call('/api/custom-auth/register', 'POST', {});
    assert('Public registration disabled', reg.status === 403, `HTTP ${reg.status}`);
  } else {
    console.log('SKIP registration check (set IMS_EXPECT_PUBLIC_REGISTRATION_BLOCKED=YES when configured)');
  }
  for (const prefix of ['MANAGER','STAFF','VIEWER']) {
    const cookie = await login(prefix);
    if (!cookie) continue;
    const hist = await call('/api/stock-movements?page=1&pageSize=1', 'GET', undefined, cookie);
    assert(`${prefix} may read movement history`, hist.status === 200, `HTTP ${hist.status}`);
    if (prefix === 'VIEWER') {
      const adjustment = await call('/api/inventory/adjustments', 'POST', {}, cookie);
      assert('VIEWER adjustment denied', adjustment.status === 403, `HTTP ${adjustment.status}`);
      const count = await call('/api/inventory/counts', 'POST', {}, cookie);
      assert('VIEWER count creation denied', count.status === 403, `HTTP ${count.status}`);
      const products = await call('/api/products', 'POST', {}, cookie);
      assert('VIEWER product creation denied', products.status === 403, `HTTP ${products.status}`);
    }
    if (prefix === 'STAFF') {
      const finalize = await call('/api/inventory/counts/00000000-0000-4000-8000-000000000001/finalize', 'POST', {}, cookie);
      assert('STAFF count finalization denied', finalize.status === 403, `HTTP ${finalize.status}`);
    }
  }
  console.log(`\n${checks.length - failures}/${checks.length} checks passed`);
  process.exitCode = failures ? 1 : 0;
}
main().catch(err => { console.error('ERROR:', err.message); process.exitCode = 1; });
