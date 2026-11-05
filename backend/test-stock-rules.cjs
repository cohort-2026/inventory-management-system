const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  StockRuleError,
  parsePositiveStockQuantity,
  assertActiveStockProduct,
  removeStockAtLocation,
} = require('./dist/services/stockRules.js');

const productId = '20804bfa-cfa8-4094-9afe-a8ecd5090630';
const locationId = 'c7b79ad6-4556-4498-b73e-3bbd515df57f';

for (const invalid of [undefined, null, '', '0', 0, '-1', -1, 'abc', 'NaN', 1/0, '1e3']) {
  test(`reject invalid quantity ${String(invalid)}`, () => {
    assert.throws(() => parsePositiveStockQuantity(invalid), (e) => e instanceof StockRuleError && e.statusCode === 400);
  });
}
test('accept positive fractional and whole values', () => {
  assert.equal(parsePositiveStockQuantity('0.125'), '0.125');
  assert.equal(parsePositiveStockQuantity(3), '3');
});

test('missing inventory row gives 409 and available 0, with no UPDATE', async () => {
  let calls = 0;
  const client = { query: async () => { calls++; return { rows: [] }; } };
  await assert.rejects(removeStockAtLocation(client, productId, locationId, '8'),
    (e) => e instanceof StockRuleError && e.statusCode === 409 && e.message.includes('only 0'));
  assert.equal(calls, 1);
});

test('insufficient stock gives 409 with locked balance, with no UPDATE', async () => {
  let calls = 0;
  const client = { query: async () => { calls++; return { rows: [{ inventory_id: 'x', available: '5.0', sufficient: false }] }; } };
  await assert.rejects(removeStockAtLocation(client, productId, locationId, '8'),
    (e) => e instanceof StockRuleError && e.statusCode === 409 && e.message === 'Cannot remove 8; only 5.0 in stock at this location.');
  assert.equal(calls, 1);
});

test('exact-stock removal uses locked read and guarded atomic UPDATE', async () => {
  const queries = [];
  const client = { query: async (sql, args) => {
    queries.push([sql, args]);
    if (queries.length === 1) return { rows: [{ inventory_id: 'x', available: '5.0', sufficient: true }] };
    return { rows: [{ inventory_id: 'x', quantity_before: '5.0', quantity_after: '0.0' }] };
  }};
  const result = await removeStockAtLocation(client, productId, locationId, '5');
  assert.equal(result.quantity_after, '0.0');
  assert.match(queries[0][0], /FOR UPDATE/);
  assert.match(queries[1][0], /quantity >= \$3::numeric/);
});

test('archived product rejected by shared helper', async () => {
  const client = { query: async () => ({ rows: [{ status: 'archived' }] }) };
  await assert.rejects(assertActiveStockProduct(client, productId),
    (e) => e instanceof StockRuleError && e.statusCode === 400);
});
