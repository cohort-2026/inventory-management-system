
import {
  createHash,
  randomBytes,
} from 'node:crypto';

import { dbPool } from '../db/pool';

const SESSION_LIFETIME_DAYS = 7;
const SESSION_TOKEN_BYTES = 32;

export type SessionUser = {
  id: string;
  email: string;
  roleId: string;
  status: string;
};

export type CreatedSession = {
  token: string;
  expiresAt: Date;
};

// Create a cryptographically random token.
function generateToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('hex');
}

// Store a digest, never the original token.
function hashToken(token: string): Buffer {
  return createHash('sha256')
    .update(token, 'utf8')
    .digest();
}

// Our tokens are 32 random bytes encoded as hexadecimal.
function isValidTokenFormat(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    /^[a-f0-9]{64}$/.test(token)
  );
}

// Create a new session after successful authentication.
export async function createSession(
  userId: string,
): Promise<CreatedSession> {
  const token = generateToken();
  const tokenHash = hashToken(token);

  const expiresAt = new Date(
    Date.now() +
    SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000
  );

  await dbPool.query(
    `
      INSERT INTO public.auth_sessions (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt],
  );

  return {
    token,
    expiresAt,
  };
}

// Find the active application user for a valid session.
export async function validateSession(
  token: unknown,
): Promise<SessionUser | null> {
  if (!isValidTokenFormat(token)) {
    return null;
  }

  const tokenHash = hashToken(token);

  const result = await dbPool.query<{
    user_id: string;
    email: string;
    role_id: string;
    status: string;
  }>(
    `
      SELECT
        u.user_id,
        u.email,
        u.role_id,
        u.status
      FROM public.auth_sessions AS s
      INNER JOIN public.users AS u
        ON u.user_id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'
      LIMIT 1
    `,
    [tokenHash],
  );

  const user = result.rows[0];

  if (!user) {
    return null;
  }

  return {
    id: user.user_id,
    email: user.email,
    roleId: user.role_id,
    status: user.status,
  };
}

// Revoke the session represented by this token.
export async function revokeSession(
  token: unknown,
): Promise<void> {
  if (!isValidTokenFormat(token)) {
    return;
  }

  await dbPool.query(
    `
      UPDATE public.auth_sessions
      SET revoked_at = now()
      WHERE token_hash = $1
        AND revoked_at IS NULL
    `,
    [hashToken(token)],
  );
}

// Revoke every session belonging to one account.
// Useful for password resets and account suspension.
export async function revokeAllUserSessions(
  userId: string,
): Promise<void> {
  await dbPool.query(
    `
      UPDATE public.auth_sessions
      SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId],
  );
}
