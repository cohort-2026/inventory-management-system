
import { dbPool } from '../db/pool';

import {
  issueActionToken,
  redeemActionToken,
} from './actionTokenService';

import {
  sendTransactionalEmail,
} from '../email/mailService';

const RESEND_COOLDOWN_SECONDS = 60;

function getVerificationUrl(token: string): string {
  const frontendUrl =
    process.env.FRONTEND_URL ??
    'http://localhost:5173';

  const url = new URL('/verify-email', frontendUrl);

  // The fragment is not sent to the web server
  // automatically. React will read it later.
  url.hash = new URLSearchParams({
    token,
  }).toString();

  return url.toString();
}

/**
 * Issue and email a verification token.
 *
 * The account remains unverified until the
 * recipient explicitly redeems the token.
 */
export async function sendVerificationEmail(
  userId: string,
  email: string,
): Promise<void> {
  const issued = await issueActionToken(
    userId,
    'email_verification',
  );

  const url = getVerificationUrl(issued.token);

  await sendTransactionalEmail(
    email,
    'Verify your Inventory App account',
    [
      'Welcome to Inventory App!',
      '',
      'Please verify your email address using this link:',
      '',
      url,
      '',
      'This link expires in 24 hours.',
      'If you did not create this account,',
      'you can ignore this message.',
    ].join('\n'),
  );
}

/**
 * Redeem a verification token.
 *
 * The token consumption and account update
 * are committed together.
 */
export async function verifyEmailAddress(
  token: unknown,
): Promise<boolean> {
  return redeemActionToken(
    token,
    'email_verification',
    async (client, userId) => {
      const result = await client.query(
        `
          UPDATE public.user_credentials
          SET email_verified_at =
            COALESCE(email_verified_at, now())
          WHERE user_id = $1
        `,
        [userId],
      );

      if (result.rowCount !== 1) {
        throw new Error(
          'Verification credentials not found',
        );
      }
    },
  );
}

/**
 * Resend only for an existing, active,
 * unverified account.
 *
 * The caller must always provide the same
 * public response regardless of account state.
 */
export async function resendVerificationEmail(
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
            AND t.purpose = 'email_verification'
        ) AS last_issued_at
      FROM public.users u
      JOIN public.user_credentials c
        ON c.user_id = u.user_id
      WHERE lower(u.email) = $1
        AND u.status = 'active'
        AND c.email_verified_at IS NULL
      LIMIT 1
    `,
    [normalizedEmail],
  );

  const user = result.rows[0];

  if (!user) {
    return;
  }

  // Avoid repeatedly sending messages when the
  // user clicks resend in quick succession.
  if (
    user.last_issued_at &&
    Date.now() -
      new Date(user.last_issued_at).getTime() <
      RESEND_COOLDOWN_SECONDS * 1000
  ) {
    return;
  }

  await sendVerificationEmail(
    user.user_id,
    user.email,
  );
}
