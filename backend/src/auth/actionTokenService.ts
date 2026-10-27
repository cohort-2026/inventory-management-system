
import {
  createHash,
  randomBytes,
} from 'node:crypto';

import type { PoolClient } from 'pg';

import { dbPool } from '../db/pool';

export type ActionTokenPurpose =
  | 'email_verification'
  | 'password_reset';

export type IssuedActionToken = {
  token: string;
  expiresAt: Date;
};

const TOKEN_BYTES = 32;

const TOKEN_LIFETIMES_MS: Record<
  ActionTokenPurpose,
  number
> = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 30 * 60 * 1000,
};

function isValidPurpose(
  purpose: string,
): purpose is ActionTokenPurpose {
  return (
    purpose === 'email_verification' ||
    purpose === 'password_reset'
  );
}

function hashToken(token: string): Buffer {
  return createHash('sha256')
    .update(token, 'utf8')
    .digest();
}

function isValidToken(
  token: unknown,
): token is string {
  return (
    typeof token === 'string' &&
    /^[a-f0-9]{64}$/.test(token)
  );
}

/**
 * Issue a fresh action token for a user.
 *
 * Older unused tokens with the same purpose
 * are invalidated in the same transaction.
 *
 * Never log or persist the raw token.
 */
export async function issueActionToken(
  userId: string,
  purpose: ActionTokenPurpose,
): Promise<IssuedActionToken> {
  if (
    typeof userId !== 'string' ||
    !userId ||
    !isValidPurpose(purpose)
  ) {
    throw new Error('Invalid action token request');
  }

  const token = randomBytes(
    TOKEN_BYTES,
  ).toString('hex');

  const expiresAt = new Date(
    Date.now() + TOKEN_LIFETIMES_MS[purpose],
  );

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    // Serialize issuance for this user, preventing
    // concurrent resends from leaving multiple
    // active tokens of the same purpose.
    const lockedUser = await client.query(
      `
        SELECT user_id
        FROM public.users
        WHERE user_id = $1
        FOR UPDATE
      `,
      [userId],
    );

    if (lockedUser.rowCount !== 1) {
      throw new Error('Action token user not found');
    }

    // Mark older unused tokens as consumed.
    await client.query(
      `
        UPDATE public.auth_action_tokens
        SET used_at = now()
        WHERE user_id = $1
          AND purpose = $2
          AND used_at IS NULL
      `,
      [userId, purpose],
    );

    await client.query(
      `
        INSERT INTO public.auth_action_tokens (
          user_id,
          purpose,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        userId,
        purpose,
        hashToken(token),
        expiresAt,
      ],
    );

    await client.query('COMMIT');

    return {
      token,
      expiresAt,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Redeem a token and perform its account action
 * as one transaction.
 *
 * Returns false for an invalid, expired, already
 * used, or wrong-purpose token.
 *
 * onRedeem may update credentials or verification
 * status using the SAME PostgreSQL client.
 *
 * If onRedeem fails, everything rolls back,
 * including consumption of the token.
 */
export async function redeemActionToken(
  token: unknown,
  purpose: ActionTokenPurpose,
  onRedeem: (
    client: PoolClient,
    userId: string,
  ) => Promise<void>,
): Promise<boolean> {
  if (
    !isValidToken(token) ||
    !isValidPurpose(purpose)
  ) {
    return false;
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    // This conditional UPDATE is atomic:
    // only one competing request can redeem
    // this token successfully.
    const result = await client.query<{
      user_id: string;
    }>(
      `
        UPDATE public.auth_action_tokens
        SET used_at = now()
        WHERE token_hash = $1
          AND purpose = $2
          AND used_at IS NULL
          AND expires_at > now()
        RETURNING user_id
      `,
      [
        hashToken(token),
        purpose,
      ],
    );

    const userId = result.rows[0]?.user_id;

    if (!userId) {
      await client.query('ROLLBACK');
      return false;
    }

    await onRedeem(client, userId);

    await client.query('COMMIT');

    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
