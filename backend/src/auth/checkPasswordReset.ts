
import { randomBytes } from 'node:crypto';

import { dbPool } from '../db/pool';

import {
  registerUser,
  authenticateUser,
} from './authService';

import {
  createSession,
  validateSession,
} from './sessionService';

import {
  issueActionToken,
} from './actionTokenService';

import {
  resetPassword,
} from './passwordResetService';

async function main(): Promise<void> {
  const email =
    `ims-reset-${randomBytes(8).toString('hex')}@example.invalid`;

  const originalPassword =
    `Original-${randomBytes(16).toString('hex')}!`;

  const replacementPassword =
    `Replacement-${randomBytes(16).toString('hex')}!`;

  let userId: string | null = null;
  let failures = 0;

  function check(
    name: string,
    condition: boolean,
  ): void {
    console.log(
      `${name}: ${condition ? 'PASS' : 'FAIL'}`,
    );

    if (!condition) {
      failures++;
    }
  }

  try {
    const user = await registerUser({
      firstName: 'Password',
      lastName: 'ResetTest',
      email,
      password: originalPassword,
    });

    userId = user.id;

    // Development test only: mark this temporary
    // account as verified.
    await dbPool.query(
      `
        UPDATE public.user_credentials
        SET email_verified_at = now()
        WHERE user_id = $1
      `,
      [user.id],
    );

    const beforeReset = await authenticateUser(
      email,
      originalPassword,
    );

    check(
      'originalPasswordWorks',
      beforeReset?.id === user.id,
    );

    // Create a live session to check revocation.
    const session = await createSession(user.id);

    const sessionBefore = await validateSession(
      session.token,
    );

    check(
      'sessionActiveBeforeReset',
      sessionBefore?.id === user.id,
    );

    const issued = await issueActionToken(
      user.id,
      'password_reset',
    );

    const resetSucceeded = await resetPassword(
      issued.token,
      replacementPassword,
    );

    check(
      'passwordResetSucceeded',
      resetSucceeded,
    );

    const oldPasswordLogin =
      await authenticateUser(
        email,
        originalPassword,
      );

    check(
      'oldPasswordRejected',
      oldPasswordLogin === null,
    );

    const newPasswordLogin =
      await authenticateUser(
        email,
        replacementPassword,
      );

    check(
      'newPasswordAccepted',
      newPasswordLogin?.id === user.id,
    );

    const sessionAfter = await validateSession(
      session.token,
    );

    check(
      'existingSessionRevoked',
      sessionAfter === null,
    );

    const replay = await resetPassword(
      issued.token,
      replacementPassword,
    );

    check(
      'resetTokenReplayRejected',
      replay === false,
    );

    // A verification token cannot be used
    // to reset the password.
    const verificationToken =
      await issueActionToken(
        user.id,
        'email_verification',
      );

    const wrongPurpose = await resetPassword(
      verificationToken.token,
      replacementPassword,
    );

    check(
      'wrongPurposeRejected',
      wrongPurpose === false,
    );

    const credentials = await dbPool.query<{
      password_hash: string;
      password_changed_at: Date;
    }>(
      `
        SELECT
          password_hash,
          password_changed_at
        FROM public.user_credentials
        WHERE user_id = $1
      `,
      [user.id],
    );

    check(
      'argon2idHashStored',
      credentials.rows[0]?.password_hash
        .startsWith('$argon2id$') === true,
    );

  } catch (error) {
    failures++;

    console.error(
      'Password reset test failed:',
      error instanceof Error
        ? error.message
        : error,
    );
  } finally {
    if (userId) {
      try {
        const client = await dbPool.connect();

        try {
          await client.query('BEGIN');

          await client.query(
            `
              DELETE FROM public.auth_sessions
              WHERE user_id = $1
            `,
            [userId],
          );

          await client.query(
            `
              DELETE FROM public.auth_action_tokens
              WHERE user_id = $1
            `,
            [userId],
          );

          await client.query(
            `
              DELETE FROM public.user_credentials
              WHERE user_id = $1
            `,
            [userId],
          );

          await client.query(
            `
              DELETE FROM public.users
              WHERE user_id = $1
            `,
            [userId],
          );

          await client.query('COMMIT');

          console.log(
            'Test account cleanup: PASS',
          );
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      } catch (error) {
        failures++;

        console.error(
          'Test account cleanup: FAIL',
          error instanceof Error
            ? error.message
            : error,
        );
      }
    }

    await dbPool.end();
  }

  console.log(
    'Password reset tests:',
    failures === 0 ? 'PASS' : 'FAIL',
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(
    'Unexpected password reset test error:',
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode = 1;
});
