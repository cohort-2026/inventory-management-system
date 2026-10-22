import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin, supabaseAuth } from '../config/supabaseAuthClient';

export type ApplicationRole = 'manager' | 'inventory_staff' | 'viewer';

export type AuthenticatedIdentity = {
  id: string;
  email: string;
  username?: string;
  roleId: string;
  status: string;
  role: ApplicationRole;
};

export type AuthenticatedRequest = Request & {
  authenticatedUser?: AuthenticatedIdentity;
};

function parseApplicationRole(name: unknown): ApplicationRole | undefined {
  if (typeof name !== 'string') {
    return undefined;
  }

  switch (name.trim().toLowerCase()) {
    case 'manager':
      return 'manager';
    case 'inventory staff':
    case 'inventory_staff':
      return 'inventory_staff';
    case 'viewer':
      return 'viewer';
    default:
      return undefined;
  }
}

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
      .select('user_id, email, role_id, status, roles!inner(name)')
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

    const roleRecord = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
    const role = parseApplicationRole(roleRecord?.name);
    if (!role) {
      console.error(`Application account ${identity.user.id} has an unrecognized role`);
      res.status(403).json({ error: 'Application account role is unavailable' });
      return;
    }

    req.authenticatedUser = {
      id: identity.user.id,
      email: identity.user.email,
      ...(typeof identity.user.user_metadata?.username === 'string'
        ? { username: identity.user.user_metadata.username }
        : {}),
      roleId: profile.role_id,
      status: profile.status,
      role,
    };
    next();
  } catch (error) {
    console.error('Unexpected authentication error:', error);
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
}

export function supabaseRequireRoles(...allowedRoles: ApplicationRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authenticatedUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.authenticatedUser.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action' });
      return;
    }

    next();
  };
}
