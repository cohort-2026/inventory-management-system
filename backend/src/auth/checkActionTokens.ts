
import {
  createHash,
  randomBytes,
} from 'node:crypto';

import { dbPool } from '../db/pool';

import { registerUser } from './authService';

import {
  issueActionToken,
  redeemActionToken,
} from './actionTokenService';

async function main(): Promise<void> {
  const testEmail =
    `ims-token-${randomBytes(8).toString('hex')}@example.invalid`;

  let userId: string | null = null;
  let failures = 0;

  function check(
    name: string,
    passed: boolean,
  ): void {
    console.log(
      `${name}: ${passed ? 'PASS' : 'FAIL'}`,
    );

    if (!passed) {
      failures++;
    }
  }

  try {
    const user = await registerUser({
      firstName: 'Token',
      lastName: 'Test',
      email: testEmail,
      password:
        `Test-${randomBytes(16).toString('hex')}!`,
    });

    userId = user.id;

    // Test 1: Token is random and correctly formatted.
    const first = await issueActionToken(
      user.id,
      'email_verification',
    );

    check(
      'tokenCreated',
      /^[a-f0-9]{64}$/.test(first.token),
    );

    // Test 2: Only a hash is stored in PostgreSQL.
    const expectedHash = createHash('sha256')
      .update(first.token)
      .digest();

    const stored = await dbPool.query<{
      token_hash: Buffer;
    }>(
      `
        SELECT token_hash
        FROM public.auth_action_tokens
        WHERE user_id = $1
          AND purpose = 'email_verification'
          AND used_at IS NULL
      `,
      [user.id],
    );

    const storedRow = stored.rows[0];

    check(
      'hashedTokenStored',
      stored.rows.length === 1 &&
      storedRow !== undefined &&
      storedRow.token_hash.equals(expectedHash),
    );

    // Test 3: Wrong purpose must not consume token.
    const wrongPurpose = await redeemActionToken(
      first.token,
      'password_reset',
      async () => {},
    );

    check(
      'wrongPurposeRejected',
      wrongPurpose === false,
    );

    // Test 4: A failed account update must
    // roll back token consumption.
    let rollbackWorked = false;

    try {
      await redeemActionToken(
        first.token,
        'email_verification',
        async () => {
          throw new Error(
            'Intentional test transaction failure',
          );
        },
      );
    } catch {
      rollbackWorked = true;
    }

    // Test 5: The same token must remain usable
    // after the failed transaction.
    const verified = await redeemActionToken(
      first.token,
      'email_verification',
      async (client, targetUserId) => {
        await client.query(
          `
            UPDATE public.user_credentials
            SET email_verified_at = now()
            WHERE user_id = $1
          `,
          [targetUserId],
        );
      },
    );

    check(
      'transactionRollbackProtectedToken',
      rollbackWorked && verified,
    );

    // Test 6: Used token cannot be reused.
    const replay = await redeemActionToken(
      first.token,
      'email_verification',
      async () => {},
    );

    check(
      'replayRejected',
      replay === false,
    );

    // Test 7: Replacement token invalidates
    // the previous unused token.
    const older = await issueActionToken(
      user.id,
      'password_reset',
    );

    const newer = await issueActionToken(
      user.id,
      'password_reset',
    );

    const oldAccepted = await redeemActionToken(
      older.token,
      'password_reset',
      async () => {},
    );

    const newAccepted = await redeemActionToken(
      newer.token,
      'password_reset',
      async () => {},
    );

    check(
      'replacementInvalidatesOldToken',
      !oldAccepted && newAccepted,
    );

    // Test 8: Expired tokens cannot be redeemed.
    const expiring = await issueActionToken(
      user.id,
      'password_reset',
    );

    const expiringHash = createHash('sha256')
      .update(expiring.token)
      .digest();

    // Change the clock-related fields on ONLY
    // this temporary test token.
    await dbPool.query(
      `
        UPDATE public.auth_action_tokens
        SET created_at = now() - interval '2 days',
            expires_at = now() - interval '1 day'
        WHERE token_hash = $1
          AND user_id = $2
      `,
      [expiringHash, user.id],
    );

    const expiredAccepted = await redeemActionToken(
      expiring.token,
      'password_reset',
      async () => {},
    );

    check(
      'expiredTokenRejected',
      expiredAccepted === false,
    );

    // Test 9: Malformed tokens must be rejected.
    const malformedAccepted = await redeemActionToken(
      'not-a-valid-token',
      'email_verification',
      async () => {},
    );

    check(
      'malformedTokenRejected',
      malformedAccepted === false,
    );

  } catch (error) {
    failures++;

    console.error(
      'Action token test failed:',
      error instanceof Error ? error.message : error,
    );
  } finally {
    if (userId) {
      try {
        await dbPool.query(
          `
            DELETE FROM public.auth_action_tokens
            WHERE user_id = $1
          `,
          [userId],
        );

        await dbPool.query(
          `
            DELETE FROM public.user_credentials
            WHERE user_id = $1
          `,
          [userId],
        );

        await dbPool.query(
          `
            DELETE FROM public.users
            WHERE user_id = $1
          `,
          [userId],
        );

        console.log('Test account cleanup: PASS');
      } catch (error) {
        failures++;

        console.error(
          'Test account cleanup: FAIL',
          error instanceof Error ? error.message : error,
        );
      }
    }

    await dbPool.end();
  }

  console.log(
    `Action token tests: ${
      failures === 0 ? 'PASS' : 'FAIL'
    }`,
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(
    'Unexpected test failure:',
    error instanceof Error ? error.message : error,
  );

  process.exitCode = 1;
});
