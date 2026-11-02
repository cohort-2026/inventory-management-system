
import type { PoolClient } from 'pg';

import { dbPool } from '../db/pool';
import {
  hashPassword,
  verifyPassword,
} from './passwordService';

export type RegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  status: string;
  emailVerified: boolean;
};

export class AuthServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateRegistration(
  input: RegistrationInput,
): void {
  const {
    firstName,
    lastName,
    email,
    password,
  } = input;

  if (
    typeof firstName !== 'string' ||
    !firstName.trim() ||
    firstName.trim().length > 100 ||
    typeof lastName !== 'string' ||
    !lastName.trim() ||
    lastName.trim().length > 100
  ) {
    throw new AuthServiceError(
      'INVALID_NAMES',
      400,
      'First name and last name are required.',
    );
  }

  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizeEmail(email),
    )
  ) {
    throw new AuthServiceError(
      'INVALID_EMAIL',
      400,
      'Enter a valid email address.',
    );
  }

  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    Buffer.byteLength(password, 'utf8') > 1024
  ) {
    throw new AuthServiceError(
      'INVALID_PASSWORD',
      400,
      'Password must be at least 8 characters.',
    );
  }
}

type UserRow = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role_id: string;
  status: string;
  email_verified_at: Date | null;
};

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.user_id,
    email: row.email,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    roleId: row.role_id,
    status: row.status,
    emailVerified: row.email_verified_at !== null,
  };
}

async function getViewerRoleId(
  client: PoolClient,
): Promise<string> {
  const result = await client.query<{
    role_id: string;
  }>(
    `
      SELECT role_id
      FROM public.roles
      WHERE name = 'Viewer'
      LIMIT 1
    `,
  );

  const roleId = result.rows[0]?.role_id;

  if (!roleId) {
    throw new Error(
      'Required Viewer role is missing.',
    );
  }

  return roleId;
}

// Create a pending-verification Viewer account.
export async function registerUser(
  input: RegistrationInput,
): Promise<AuthUser> {
  validateRegistration(input);

  const email = normalizeEmail(input.email);

  // Hash outside the transaction to reduce
  // the time the database transaction is open.
  const passwordHash = await hashPassword(
    input.password,
  );

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const viewerRoleId = await getViewerRoleId(
      client,
    );

    const existing = await client.query(
      `
        SELECT 1
        FROM public.users
        WHERE lower(email) = $1
        LIMIT 1
      `,
      [email],
    );

    if (existing.rowCount) {
      throw new AuthServiceError(
        'EMAIL_EXISTS',
        409,
        'An account with this email already exists.',
      );
    }

    const created = await client.query<{
      user_id: string;
    }>(
      `
        INSERT INTO public.users (
          first_name,
          last_name,
          email,
          role_id,
          status
        )
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING user_id
      `,
      [
        input.firstName.trim(),
        input.lastName.trim(),
        email,
        viewerRoleId,
      ],
    );

    const userId = created.rows[0]?.user_id;

    if (!userId) {
      throw new Error('User creation failed.');
    }

    await client.query(
      `
        INSERT INTO public.user_credentials (
          user_id,
          password_hash,
          email_verified_at
        )
        VALUES ($1, $2, NULL)
      `,
      [userId, passwordHash],
    );

    await client.query('COMMIT');

    return {
      id: userId,
      email,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      roleId: viewerRoleId,
      status: 'active',
      emailVerified: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    // PostgreSQL unique violation.
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new AuthServiceError(
        'EMAIL_EXISTS',
        409,
        'An account with this email already exists.',
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

// Validate existing credentials.
//
// Returns null for invalid credentials,
// unverified email or inactive accounts.
export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.length > 254 ||
    Buffer.byteLength(password, 'utf8') > 1024
  ) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);

  if (
    !normalizedEmail ||
    !password
  ) {
    return null;
  }

  const result = await dbPool.query<
    UserRow & { password_hash: string }
  >(
    `
      SELECT
        u.user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.role_id,
        u.status,
        c.password_hash,
        c.email_verified_at
      FROM public.users AS u
      INNER JOIN public.user_credentials AS c
        ON c.user_id = u.user_id
      WHERE lower(u.email) = $1
      LIMIT 1
    `,
    [normalizedEmail],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const matches = await verifyPassword(
    row.password_hash,
    password,
  );

  if (!matches) {
    return null;
  }

  if (
    row.status !== 'active' ||
    row.email_verified_at === null
  ) {
    return null;
  }

  return mapUser(row);
}
