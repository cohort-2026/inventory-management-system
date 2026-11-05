import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { calculateInventoryStatus: status } =
  require('../../dist/services/inventoryStatus.js');

test('out of stock at exactly zero, including zero threshold', () => {
  assert.equal(status('0', '10'), 'OUT_OF_STOCK');
  assert.equal(status('0', '0'), 'OUT_OF_STOCK');
  assert.equal(status('0.000', '10'), 'OUT_OF_STOCK');
});

test('low stock only for positive quantity below threshold', () => {
  assert.equal(status('3', '10'), 'LOW_STOCK');
  assert.equal(status('9.99', '10'), 'LOW_STOCK');
  assert.equal(status('0.0001', '0.0002'), 'LOW_STOCK');
});

test('in stock when equal or above the reorder level', () => {
  assert.equal(status('10', '10'), 'IN_STOCK');
  assert.equal(status('11', '10'), 'IN_STOCK');
  assert.equal(status('5', '0'), 'IN_STOCK');
  assert.equal(status('10.000', '10.0'), 'IN_STOCK');
});

test('exact decimal comparisons avoid floating point rounding', () => {
  assert.equal(status('9007199254740993', '9007199254740994'), 'LOW_STOCK');
  assert.equal(status('0.10000000000000000001', '0.1'), 'IN_STOCK');
});

test('invalid quantities and thresholds are rejected', () => {
  for (const bad of [null, undefined, '', ' ', '-1', 'abc', 'NaN', '1e3', Infinity, -1]) {
    assert.throws(() => status(bad, '10'));
    assert.throws(() => status('5', bad));
  }
});
