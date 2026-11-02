import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin, supabaseAuth } from '../auth/supabaseAuthClient';

export type AuthenticatedIdentity = {
  id: string;
  email: string;
  roleId: string;
  status: string;
};

export type AuthenticatedRequest = Request & {
  authenticatedUser?: AuthenticatedIdentity;
};

export async function supabaseRequireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = req.headers.authorization;
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Missing or malformed Bearer token' });
    return;
  }

  try {
    const { data: identity, error: tokenError } = await supabaseAuth.auth.getUser(match[1]!);
    if (tokenError || !identity.user || !identity.user.email) {
      res.status(401).json({ error: 'Invalid or expired access token' });
      return;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('user_id, email, role_id, status')
      .eq('user_id', identity.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Application profile lookup failed:', profileError.message);
      res.status(503).json({ error: 'Authentication profile lookup unavailable' });
      return;
    }

    if (!profile || String(profile.status).toLowerCase() !== 'active') {
      res.status(403).json({ error: 'Application account is unavailable' });
      return;
    }

    req.authenticatedUser = {
      id: identity.user.id,
      email: identity.user.email,
      roleId: profile.role_id,
      status: profile.status,
    };
    next();
  } catch (error) {
    console.error('Unexpected authentication error:', error);
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
}