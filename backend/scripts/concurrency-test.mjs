
import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = 'http://localhost:5000/api';

const PRODUCT_ID = '20804bfa-cfa8-4094-9afe-a8ecd5090630';
const MAIN_LOCATION = 'c7b79ad6-4556-4498-b73e-3bbd515df57f';
const BACKUP_LOCATION = 'efbc976b-23b1-4976-bc6f-465b8fc40c6d';

const SESSION_TOKEN = process.env.IMS_SESSION_TOKEN;

if (!SESSION_TOKEN) {
  throw new Error('IMS_SESSION_TOKEN environment variable is missing.');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not configured.');
}

const ca = readFileSync(
  resolve(process.cwd(), 'certs', 'prod-ca-2021.crt'),
  'utf8',
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { ca, rejectUnauthorized: true },
  connectionTimeoutMillis: 10000,
});

async function apiPost(endpoint, body) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `ims_custom_session=${SESSION_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return {
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      status: 0,
      data: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getSnapshot(locationId) {
  const result = await pool.query(
    `SELECT
       COALESCE(
         (SELECT quantity
          FROM public.inventory
          WHERE product_id = $1 AND location_id = $2),
         0
       )::text AS quantity,
       COALESCE(
         (SELECT SUM(quantity_change)
          FROM public.stock_movements
          WHERE product_id = $1 AND location_id = $2),
         0
       )::text AS movement_total`,
    [PRODUCT_ID, locationId],
  );

  return {
    quantity: Number(result.rows[0].quantity),
    movementTotal: Number(result.rows[0].movement_total),
  };
}

async function adjustStock(locationId, direction, quantity) {
  if (quantity <= 0) return;

  const result = await apiPost('/inventory/adjustments', {
    product_id: PRODUCT_ID,
    location_id: locationId,
    direction,
    quantity: String(quantity),
    reason: 'Issue #24 concurrency test preparation',
    notes: 'Automated concurrency test',
  });

  if (result.status !== 200) {
    throw new Error(
      `Stock preparation failed (${result.status}): ${JSON.stringify(result.data)}`,
    );
  }
}

async function setStockTo(locationId, target) {
  const current = await getSnapshot(locationId);
  const difference = target - current.quantity;

  if (difference > 0) {
    await adjustStock(locationId, 'increase', difference);
  } else if (difference < 0) {
    await adjustStock(locationId, 'decrease', Math.abs(difference));
  }

  const updated = await getSnapshot(locationId);

  if (updated.quantity !== target) {
    throw new Error(
      `Could not prepare location ${locationId}. Expected ${target}, got ${updated.quantity}.`,
    );
  }

  console.log(`Prepared location ${locationId}: ${target} units.`);
}

function verifyReconciliation(before, after, label) {
  const inventoryChange = after.quantity - before.quantity;
  const movementChange = after.movementTotal - before.movementTotal;

  const matches = Math.abs(inventoryChange - movementChange) < 0.000001;

  console.log(`\n${label} reconciliation:`);
  console.log('Inventory change:', inventoryChange);
  console.log('Movement change:', movementChange);
  console.log('Result:', matches ? 'PASS' : 'FAIL');

  if (!matches) {
    throw new Error(`${label} inventory does not reconcile with movements.`);
  }
}

async function testParallelRemovals() {
  console.log('\n========== TEST 1: PARALLEL REMOVALS ==========');

  await setStockTo(MAIN_LOCATION, 10);

  const before = await getSnapshot(MAIN_LOCATION);

  console.log('Sending 20 simultaneous requests to remove 1 unit each...');

  const requests = Array.from({ length: 20 }, () =>
    apiPost('/inventory/adjustments', {
      product_id: PRODUCT_ID,
      location_id: MAIN_LOCATION,
      direction: 'decrease',
      quantity: '1',
      reason: 'Issue #24 parallel removal test',
      notes: 'Automated concurrency test',
    }),
  );

  const results = await Promise.all(requests);

  console.log('\n========== ALL 20 RESPONSE DETAILS ==========');

  results.forEach((result, index) => {
    console.log(`Request ${index + 1}:`, {
      status: result.status,
      data: result.data,
    });
  });

  const successes = results.filter((result) => result.status === 200);
  const refusals = results.filter((result) => result.status === 409);

  const unexpected = results.filter(
    (result) => result.status !== 200 && result.status !== 409,
  );

  const after = await getSnapshot(MAIN_LOCATION);

  console.log('\n========== TEST 1 RESULTS ==========');
  console.log('Successful removals:', successes.length);
  console.log('Insufficient-stock refusals:', refusals.length);
  console.log('Unexpected responses:', unexpected.length);
  console.log('Final stock:', after.quantity);

  verifyReconciliation(before, after, 'Parallel removals');

  if (
    successes.length !== 10 ||
    refusals.length !== 10 ||
    unexpected.length !== 0 ||
    after.quantity !== 0
  ) {
    throw new Error('Parallel removal test FAILED.');
  }

  console.log('PARALLEL REMOVAL TEST: PASS');
}

async function testOppositeTransfers() {
  console.log('\n========== TEST 2: OPPOSITE TRANSFERS ==========');

  await setStockTo(MAIN_LOCATION, 10);
  await setStockTo(BACKUP_LOCATION, 10);

  const mainBefore = await getSnapshot(MAIN_LOCATION);
  const backupBefore = await getSnapshot(BACKUP_LOCATION);

  console.log('Sending two opposite transfers simultaneously...');

  const [mainToBackup, backupToMain] = await Promise.all([
    apiPost('/inventory/transfers', {
      product_id: PRODUCT_ID,
      from_location_id: MAIN_LOCATION,
      to_location_id: BACKUP_LOCATION,
      quantity: '1',
      note: 'Issue #24 opposite transfer test',
    }),

    apiPost('/inventory/transfers', {
      product_id: PRODUCT_ID,
      from_location_id: BACKUP_LOCATION,
      to_location_id: MAIN_LOCATION,
      quantity: '1',
      note: 'Issue #24 opposite transfer test',
    }),
  ]);

  console.log('Main to Backup:', mainToBackup);
  console.log('Backup to Main:', backupToMain);

  const mainAfter = await getSnapshot(MAIN_LOCATION);
  const backupAfter = await getSnapshot(BACKUP_LOCATION);

  console.log('Main final stock:', mainAfter.quantity);
  console.log('Backup final stock:', backupAfter.quantity);

  if (
    mainToBackup.status !== 200 ||
    backupToMain.status !== 200 ||
    mainAfter.quantity !== 10 ||
    backupAfter.quantity !== 10
  ) {
    throw new Error('Opposite transfer test FAILED.');
  }

  verifyReconciliation(
    mainBefore,
    mainAfter,
    'Main Hardware Warehouse',
  );

  verifyReconciliation(
    backupBefore,
    backupAfter,
    'Backup Warehouse',
  );

  console.log('OPPOSITE TRANSFER TEST: PASS');
}

async function main() {
  try {
    await testParallelRemovals();
    await testOppositeTransfers();

    console.log('\n========== ALL CONCURRENCY TESTS PASSED ==========');
  } catch (error) {
    console.error('\nCONCURRENCY TEST FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
