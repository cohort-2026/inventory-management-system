
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  validateSession,
} from '../auth/sessionService';

import type {
  SessionUser,
} from '../auth/sessionService';

import {
  CUSTOM_SESSION_COOKIE,
  clearCustomSessionCookie,
} from '../auth/customSessionCookies';

export interface SessionAuthenticatedRequest extends Request {
  authenticatedUser?: SessionUser;
}

export async function requireSession(
  req: SessionAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token: unknown =
    req.cookies?.[CUSTOM_SESSION_COOKIE];

  if (typeof token !== 'string' || !token) {
    res.status(401).json({
      error: 'Authentication required',
    });
    return;
  }

  try {
    const user = await validateSession(token);

    if (!user) {
      clearCustomSessionCookie(res);

      res.status(401).json({
        error: 'Invalid or expired session',
      });
      return;
    }

    req.authenticatedUser = user;

    next();
  } catch (error) {
    console.error(
      'Custom session verification failed:',
      error,
    );

    res.status(503).json({
      error: 'Authentication service unavailable',
    });
  }
}
