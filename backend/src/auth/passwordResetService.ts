
import { dbPool } from '../db/pool';

import {
  hashPassword,
} from './passwordService';

import {
  issueActionToken,
  redeemActionToken,
} from './actionTokenService';

import {
  sendTransactionalEmail,
} from '../email/mailService';

const RESET_COOLDOWN_SECONDS = 60;

function getPasswordResetUrl(
  token: string,
): string {
  const frontendUrl =
    process.env.FRONTEND_URL ??
    'http://localhost:5173';

  const url = new URL(
    '/reset-password',
    frontendUrl,
  );

  // Like our verification link, keep the
  // token in the URL fragment.
  url.hash = new URLSearchParams({
    token,
  }).toString();

  return url.toString();
}

/**
 * Request a recovery email.
 *
 * Do not reveal whether an email address exists.
 * Only active, verified accounts are eligible.
 */
export async function requestPasswordReset(
  email: unknown,
): Promise<void> {
  if (
    typeof email !== 'string' ||
    email.length > 254
  ) {
    return;
  }

  const normalizedEmail =
    email.trim().toLowerCase();

  if (!normalizedEmail) {
    return;
  }

  const result = await dbPool.query<{
    user_id: string;
    email: string;
    last_issued_at: Date | null;
  }>(
    `
      SELECT
        u.user_id,
        u.email,
        (
          SELECT MAX(t.created_at)
          FROM public.auth_action_tokens t
          WHERE t.user_id = u.user_id
            AND t.purpose = 'password_reset'
        ) AS last_issued_at
      FROM public.users u
      INNER JOIN public.user_credentials c
        ON c.user_id = u.user_id
      WHERE lower(u.email) = $1
        AND u.status = 'active'
        AND c.email_verified_at IS NOT NULL
      LIMIT 1
    `,
    [normalizedEmail],
  );

  const user = result.rows[0];

  if (!user) {
    return;
  }

  if (
    user.last_issued_at &&
    Date.now() -
      new Date(user.last_issued_at).getTime() <
      RESET_COOLDOWN_SECONDS * 1000
  ) {
    return;
  }

  const issued = await issueActionToken(
    user.user_id,
    'password_reset',
  );

  const url = getPasswordResetUrl(
    issued.token,
  );

  await sendTransactionalEmail(
    user.email,
    'Reset your Inventory App password',
    [
      'A password reset was requested for your account.',
      '',
      'To choose a new password, open this link:',
      '',
      url,
      '',
      'This link expires in 30 minutes.',
      'If you did not request this, ignore this email.',
      'Your existing password has not been changed.',
    ].join('\n'),
  );
}

/**
 * Reset the password using a single-use token.
 *
 * Updating credentials and revoking all sessions
 * happen inside the token redemption transaction.
 */
export async function resetPassword(
  token: unknown,
  newPassword: unknown,
): Promise<boolean> {
  if (
    typeof token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    return false;
  }

  if (
    typeof newPassword !== 'string' ||
    newPassword.length < 8 ||
    Buffer.byteLength(newPassword, 'utf8') > 1024
  ) {
    throw new Error(
      'Password must be at least 8 characters and within the allowed length.',
    );
  }

  // Hash before opening the transaction.
  // Argon2id hashing is intentionally expensive.
  const replacementHash =
    await hashPassword(newPassword);

  return redeemActionToken(
    token,
    'password_reset',
    async (client, userId) => {
      // Serialize changes affecting this account.
      const user = await client.query(
        `
          SELECT u.user_id
          FROM public.users u
          INNER JOIN public.user_credentials c
            ON c.user_id = u.user_id
          WHERE u.user_id = $1
            AND u.status = 'active'
            AND c.email_verified_at IS NOT NULL
          FOR UPDATE OF u
        `,
        [userId],
      );

      if (user.rowCount !== 1) {
        throw new Error(
          'Password reset account unavailable',
        );
      }

      const credentials =
        await client.query(
          `
            UPDATE public.user_credentials
            SET password_hash = $1,
                password_changed_at = now()
            WHERE user_id = $2
          `,
          [replacementHash, userId],
        );

      if (credentials.rowCount !== 1) {
        throw new Error(
          'Password reset credential update failed',
        );
      }

      // Invalidate every existing login session,
      // including the session used on another device.
      await client.query(
        `
          UPDATE public.auth_sessions
          SET revoked_at = now()
          WHERE user_id = $1
            AND revoked_at IS NULL
        `,
        [userId],
      );

      // Also invalidate any other unredeemed
      // password reset links for this account.
      await client.query(
        `
          UPDATE public.auth_action_tokens
          SET used_at = now()
          WHERE user_id = $1
            AND purpose = 'password_reset'
            AND used_at IS NULL
        `,
        [userId],
      );
    },
  );
}
