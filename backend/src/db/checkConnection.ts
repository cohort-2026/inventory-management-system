
import { dbPool } from './pool';

async function main() {
  try {
    const result = await dbPool.query<{
      database_name: string;
      viewer_exists: boolean;
    }>(`
      SELECT
        current_database() AS database_name,
        EXISTS (
          SELECT 1
          FROM public.roles
          WHERE name = 'Viewer'
        ) AS viewer_exists
    `);

    const row = result.rows[0];

    if (!row || !row.viewer_exists) {
      throw new Error(
        'Database connected, but the Viewer role is missing'
      );
    }

    console.log('Database connection: PASS');
    console.log('Database:', row.database_name);
    console.log('Viewer role: PASS');
    } catch (error) {
    console.error('Database connection: FAIL');

    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);

      const dbError = error as Error & {
        code?: string;
      };

      if (dbError.code) {
        console.error('Error code:', dbError.code);
      }
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  } finally {
    await dbPool.end();
  }
}

void main();
