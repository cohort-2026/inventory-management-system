
import type { PoolClient } from 'pg';

import { dbPool } from './pool';

/**
 * Returned when a concurrency-related database operation
 * still fails after one retry.
 */
export class TransactionConcurrencyError extends Error {
  public readonly statusCode = 503;

  constructor() {
    super('Stock is being updated by another request. Please try again.');
    this.name = 'TransactionConcurrencyError';
  }
}

type PgError = Error & {
  code?: string;
};

const RETRYABLE_ERROR_CODES = new Set([
  '40P01', // Deadlock detected
  '40001', // Serialization failure
  '55P03', // Lock not available / lock timeout
]);

/**
 * Executes database operations inside a transaction.
 *
 * A failed transaction is rolled back before retrying.
 * Concurrency-related errors receive one retry using
 * a fresh database connection.
 *
 * All queries must use the provided client.
 */
export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let client: PoolClient | undefined;
    let failure: unknown;
    let failed = false;

    try {
      client = await dbPool.connect();

      await client.query('BEGIN');

      await client.query("SET LOCAL lock_timeout = '5s'");

      const result = await operation(client);

      await client.query('COMMIT');

      return result;
    } catch (error) {
      failure = error;
      failed = true;

      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            'Database transaction rollback failed:',
            rollbackError,
          );
        }
      }
    } finally {
      client?.release();
    }

    if (failed) {
      const pgError = failure as PgError;

      if (!RETRYABLE_ERROR_CODES.has(pgError?.code ?? '')) {
        throw failure;
      }

      if (attempt === maxAttempts) {
        console.error(
          'Database concurrency retry exhausted:',
          failure,
        );

        throw new TransactionConcurrencyError();
      }
    }
  }

  throw new Error('Transaction could not be completed.');
}
