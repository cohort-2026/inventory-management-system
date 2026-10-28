
import type { Response } from 'express';

import type { CreatedSession } from './sessionService';

export const CUSTOM_SESSION_COOKIE = 'ims_custom_session';

const COOKIE_PATH = '/api';

const production = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: 'lax' as const,
  path: COOKIE_PATH,
};

export function setCustomSessionCookie(
  res: Response,
  session: CreatedSession,
): void {
  res.cookie(
    CUSTOM_SESSION_COOKIE,
    session.token,
    {
      ...cookieOptions,
      expires: session.expiresAt,
    },
  );
}

export function clearCustomSessionCookie(
  res: Response,
): void {
  res.clearCookie(
    CUSTOM_SESSION_COOKIE,
    cookieOptions,
  );
}
