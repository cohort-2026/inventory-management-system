
import * as argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(
  password: string,
): Promise<string> {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must contain at least 8 characters');
  }

  if (Buffer.byteLength(password, 'utf8') > 1024) {
    throw new Error('Password exceeds the allowed length');
  }

  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  if (
    typeof storedHash !== 'string' ||
    typeof password !== 'string'
  ) {
    return false;
  }

  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false;
  }
}
