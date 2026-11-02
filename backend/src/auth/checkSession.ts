
import { dbPool } from '../db/pool';

import {
  createSession,
  validateSession,
  revokeSession,
} from './sessionService';

async function main(): Promise<void> {
  let testToken: string | undefined;

  try {
    // Use an existing active account for testing.
    const users = await dbPool.query<{
      user_id: string;
    }>(
      `
        SELECT user_id
        FROM public.users
        WHERE status = 'active'
        LIMIT 1
      `,
    );

    const testUser = users.rows[0];

    if (!testUser) {
      console.log(
        'SKIPPED: No active test account exists.'
      );
      console.log(
        'Run this test again after we seed an account.'
      );
      return;
    }

    const session = await createSession(
      testUser.user_id,
    );

    testToken = session.token;

    const verified = await validateSession(
      session.token,
    );

    const validSession =
      verified?.id === testUser.user_id;

    console.log(
      'createAndValidate:',
      validSession ? 'PASS' : 'FAIL',
    );

    const invalidToken = await validateSession(
      'invalid-token',
    );

    console.log(
      'invalidTokenRejected:',
      invalidToken === null ? 'PASS' : 'FAIL',
    );

    await revokeSession(session.token);

    const revokedSession = await validateSession(
      session.token,
    );

    console.log(
      'revokedSessionRejected:',
      revokedSession === null ? 'PASS' : 'FAIL',
    );

    const expiresCorrectly =
      session.expiresAt.getTime() > Date.now();

    console.log(
      'sessionExpiryAssigned:',
      expiresCorrectly ? 'PASS' : 'FAIL',
    );

    if (
      !validSession ||
      invalidToken !== null ||
      revokedSession !== null ||
      !expiresCorrectly
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      'Session test: FAIL',
      error instanceof Error ? error.message : error,
    );

    process.exitCode = 1;
  } finally {
    // Always revoke the test session if one was created.
    if (testToken) {
      try {
        await revokeSession(testToken);
      } catch (error) {
        console.error(
          'Test session cleanup failed:',
          error instanceof Error ? error.message : error,
        );
        process.exitCode = 1;
      }
    }

    await dbPool.end();
  }
}

void main();
