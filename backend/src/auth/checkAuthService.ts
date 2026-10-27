
import { randomBytes } from 'node:crypto';

import { dbPool } from '../db/pool';

import {
  authenticateUser,
  AuthServiceError,
  registerUser,
} from './authService';

async function main(): Promise<void> {
  const testEmail =
    `ims-auth-test-${randomBytes(8).toString('hex')}@example.invalid`;

  const testPassword =
    `Test-${randomBytes(16).toString('hex')}!`;

  let createdUserId: string | null = null;
  let failures = 0;

  function check(name: string, passed: boolean): void {
    console.log(`${name}: ${passed ? 'PASS' : 'FAIL'}`);
    if (!passed) failures++;
  }

  try {
    // 1. Create account.
    const user = await registerUser({
      firstName: 'Auth',
      lastName: 'Test',
      email: testEmail,
      password: testPassword,
    });

    createdUserId = user.id;

    check(
      'registrationCreated',
      !!user.id && !user.emailVerified,
    );

    // 2. Verify default Viewer role.
    const role = await dbPool.query<{
      name: string;
    }>(
      `
        SELECT name
        FROM public.roles
        WHERE role_id = $1
      `,
      [user.roleId],
    );

    check(
      'defaultViewerRole',
      role.rows[0]?.name === 'Viewer',
    );

    // 3. Verify credentials exist.
    const credentials = await dbPool.query<{
      password_hash: string;
    }>(
      `
        SELECT password_hash
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

    // 4. Unverified account cannot sign in.
    const beforeVerification = await authenticateUser(
      testEmail,
      testPassword,
    );

    check(
      'unverifiedLoginRejected',
      beforeVerification === null,
    );

    // 5. Duplicate registration is rejected.
    let duplicateRejected = false;

    try {
      await registerUser({
        firstName: 'Another',
        lastName: 'Person',
        email: testEmail.toUpperCase(),
        password: testPassword,
      });
    } catch (error) {
      duplicateRejected =
        error instanceof AuthServiceError &&
        error.statusCode === 409;
    }

    check(
      'duplicateEmailRejected',
      duplicateRejected,
    );

    // TEST ONLY:
    // Simulate completed email verification.
    // The real verification endpoint comes later.
    await dbPool.query(
      `
        UPDATE public.user_credentials
        SET email_verified_at = now()
        WHERE user_id = $1
      `,
      [user.id],
    );

    // 6. Correct password works once verified.
    const authenticated = await authenticateUser(
      testEmail,
      testPassword,
    );

    check(
      'verifiedLoginAccepted',
      authenticated?.id === user.id,
    );

    // 7. Wrong password is rejected.
    const wrongPassword = await authenticateUser(
      testEmail,
      'ThisIsNotTheCorrectPassword!',
    );

    check(
      'wrongPasswordRejected',
      wrongPassword === null,
    );

    // 8. Inactive accounts are rejected.
    await dbPool.query(
      `
        UPDATE public.users
        SET status = 'inactive'
        WHERE user_id = $1
      `,
      [user.id],
    );

    const inactiveLogin = await authenticateUser(
      testEmail,
      testPassword,
    );

    check(
      'inactiveAccountRejected',
      inactiveLogin === null,
    );

  } catch (error) {
    failures++;

    console.error(
      'Authentication service test failed:',
      error instanceof Error ? error.message : error,
    );
  } finally {
    if (createdUserId) {
      try {
        // Credentials use ON DELETE RESTRICT,
        // so delete them before the user.
        await dbPool.query(
          `
            DELETE FROM public.user_credentials
            WHERE user_id = $1
          `,
          [createdUserId],
        );

        await dbPool.query(
          `
            DELETE FROM public.users
            WHERE user_id = $1
          `,
          [createdUserId],
        );

        console.log('Temporary account cleanup: PASS');
      } catch (error) {
        failures++;

        console.error(
          'Temporary account cleanup: FAIL',
          error instanceof Error ? error.message : error,
        );
      }
    }

    await dbPool.end();
  }

  console.log(
    `Authentication tests: ${failures === 0 ? 'PASS' : 'FAIL'}`
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
}

void main();
