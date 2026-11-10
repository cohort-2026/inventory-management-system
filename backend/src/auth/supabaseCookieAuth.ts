
import type {
  Request,
  Response,
  NextFunction,
} from 'express';

import {
  supabaseAuth,
  supabaseAdmin,
} from './supabaseAuthClient';

const cookiePath = '/api/supabase-auth';
const production = process.env.NODE_ENV === 'production';

export const accessCookie = 'ims_access';
export const refreshCookie = 'ims_refresh';

const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: 'lax' as const,
  path: cookiePath,
};

export function setSessionCookies(
  res: Response,
  session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  },
) {
  res.cookie(accessCookie, session.access_token, {
    ...cookieOptions,
    maxAge: Math.max(1, session.expires_in) * 1000,
  });

  res.cookie(refreshCookie, session.refresh_token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(accessCookie, cookieOptions);
  res.clearCookie(refreshCookie, cookieOptions);
}

export async function findActiveProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('user_id, email, role_id, status')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error('Profile lookup failed');
  }

  return data;
}

export interface CookieAuthenticatedRequest extends Request {
  authenticatedUser?: {
    id: string;
    email: string;
    roleId: string;
    status: string;
  };
}

export async function supabaseCookieAuth(
  req: CookieAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    let accessToken = req.cookies?.[accessCookie] as
      | string
      | undefined;

    const refreshToken = req.cookies?.[refreshCookie] as
      | string
      | undefined;

    let { data, error } = accessToken
      ? await supabaseAuth.auth.getUser(accessToken)
      : { data: { user: null }, error: null };

    if (error || !data.user) {
      if (!refreshToken) {
        clearSessionCookies(res);
        res.status(401).json({
          error: 'Authentication required',
        });
        return;
      }

      const refreshed =
        await supabaseAuth.auth.refreshSession({
          refresh_token: refreshToken,
        });

      if (refreshed.error || !refreshed.data.session) {
        clearSessionCookies(res);
        res.status(401).json({
          error: 'Session expired',
        });
        return;
      }

      setSessionCookies(res, refreshed.data.session);

      accessToken = refreshed.data.session.access_token;

      const verified =
        await supabaseAuth.auth.getUser(accessToken);

      data = verified.data;
      error = verified.error;
    }

    if (error || !data.user?.email) {
      clearSessionCookies(res);
      res.status(401).json({
        error: 'Invalid session',
      });
      return;
    }

    const profile = await findActiveProfile(data.user.id);

    if (!profile || profile.status !== 'active') {
      clearSessionCookies(res);
      res.status(403).json({
        error: 'Application account is unavailable',
      });
      return;
    }

    req.authenticatedUser = {
      id: data.user.id,
      email: data.user.email,
      roleId: profile.role_id,
      status: profile.status,
    };

    next();
  } catch (error) {
    console.error('Authentication verification failed', error);

    res.status(503).json({
      error: 'Authentication service unavailable',
    });
  }
}