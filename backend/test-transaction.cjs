
const assert = require('node:assert/strict');

const {
  withTransaction,
} = require('./dist/db/withTransaction.js');

async function main() {
  // Test 1: Successful transaction.
  const result = await withTransaction(async (client) => {
    const query = await client.query(
      'SELECT 2 + 3 AS result'
    );

    return query.rows[0].result;
  });

  assert.equal(result, 5);
  console.log('PASS: Successful transaction');

  // Test 2: Forced failure and rollback.
  // A temporary table is used so no application
  // inventory records are modified.
  try {
    await withTransaction(async (client) => {
      await client.query(`
        CREATE TEMP TABLE ims_transaction_test (
          value integer
        ) ON COMMIT DROP
      `);

      await client.query(`
        INSERT INTO ims_transaction_test (value)
        VALUES (123)
      `);

      throw new Error('FORCED_TEST_FAILURE');
    });

    throw new Error('Expected transaction failure');
  } catch (error) {
    assert.equal(
      error.message,
      'FORCED_TEST_FAILURE'
    );
  }

  console.log('PASS: Forced failure handled');

  // Test 3: Pool connection is usable afterwards.
  const after = await withTransaction(async (client) => {
    const query = await client.query(
      'SELECT 1 AS healthy'
    );

    return query.rows[0].healthy;
  });

  assert.equal(after, 1);
  console.log('PASS: Connection pool remains usable');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
