
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';

import { supabaseAdmin } from '../auth/supabaseAuthClient';

import type {
  AuthenticatedIdentity,
} from './supabaseRequireAuth';

// These names must match public.roles.name.
export const SYSTEM_ROLES = [
  'Manager',
  'Inventory Staff',
  'Viewer',
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export type RoleAuthenticatedRequest = Request & {
  authenticatedUser?: AuthenticatedIdentity;
  resolvedRole?: SystemRole;
};

function isSystemRole(value: string): value is SystemRole {
  return SYSTEM_ROLES.some((role) => role === value);
}

export async function resolveAuthenticatedRole(
  roleId: string,
): Promise<SystemRole | null> {
  const { data, error } = await supabaseAdmin
    .from('roles')
    .select('name')
    .eq('role_id', roleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Role lookup failed: ${error.message}`);
  }

  if (!data || typeof data.name !== 'string') {
    return null;
  }

  return isSystemRole(data.name) ? data.name : null;
}

export function supabaseRequireRole(
  ...allowedRoles: SystemRole[]
): RequestHandler {
  return async (
    req: RoleAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    // Authentication middleware must execute first.
    const user = req.authenticatedUser;

    if (!user) {
      res.status(401).json({
        error: 'Authentication required',
      });
      return;
    }

    // Fail closed when no roles were configured.
    if (allowedRoles.length === 0) {
      res.status(403).json({
        error: 'Access denied',
      });
      return;
    }

    // Require a valid, active application identity.
    if (
      user.status !== 'active' ||
      !user.roleId
    ) {
      res.status(403).json({
        error: 'Application account unavailable',
      });
      return;
    }

    try {
      const role = await resolveAuthenticatedRole(
        user.roleId,
      );

      if (!role) {
        res.status(403).json({
          error: 'No recognized role assigned',
        });
        return;
      }

      if (!allowedRoles.includes(role)) {
        res.status(403).json({
          error: 'Insufficient permissions',
        });
        return;
      }

      // Available to downstream controllers.
      req.resolvedRole = role;

      next();
    } catch (error) {
      console.error('RBAC verification failed:', error);

      res.status(503).json({
        error: 'Authorization service unavailable',
      });
    }
  };
}
