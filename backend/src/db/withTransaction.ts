
import type { PoolClient } from 'pg';

import { dbPool } from './pool';

/**
 * Executes a group of PostgreSQL operations
 * inside one database transaction.
 *
 * All queries must use the provided client.
 *
 * If every operation succeeds:
 *   COMMIT
 *
 * If an operation fails:
 *   ROLLBACK
 *
 * The client is always released back to the pool.
 */
export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await dbPool.connect();

  try {
    // Start the database transaction.
    await client.query('BEGIN');

    // Execute the operations using this connection.
    const result = await operation(client);

    // Everything succeeded.
    await client.query('COMMIT');

    return result;
  } catch (error) {
    // Undo uncommitted changes.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        'Database transaction rollback failed:',
        rollbackError,
      );
    }

    // Let the controller handle the original failure.
    throw error;
  } finally {
    // Return the connection to the pool.
    client.release();
  }
}
