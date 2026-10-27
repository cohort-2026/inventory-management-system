
import type {
  RequestHandler,
  Response,
  NextFunction,
} from 'express';

import { dbPool } from '../db/pool';

import type {
  SessionAuthenticatedRequest,
} from './requireSession';

export const SYSTEM_ROLES = [
  'Manager',
  'Inventory Staff',
  'Viewer',
] as const;

export type SystemRole =
  (typeof SYSTEM_ROLES)[number];

export type RoleAuthenticatedRequest =
  SessionAuthenticatedRequest & {
    resolvedRole?: SystemRole;
  };

function isSystemRole(
  value: string,
): value is SystemRole {
  return SYSTEM_ROLES.some(
    (role) => role === value,
  );
}

export async function resolveAuthenticatedRole(
  roleId: string,
): Promise<SystemRole | null> {
  if (!roleId) {
    return null;
  }

  const result = await dbPool.query<{
    name: string;
  }>(
    `
      SELECT name
      FROM public.roles
      WHERE role_id = $1
      LIMIT 1
    `,
    [roleId],
  );

  const name = result.rows[0]?.name;

  return name && isSystemRole(name)
    ? name
    : null;
}

export function customRequireRole(
  ...allowedRoles: SystemRole[]
): RequestHandler {
  return async (
    req: RoleAuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const user = req.authenticatedUser;

    if (!user) {
      res.status(401).json({
        error: 'Authentication required',
      });
      return;
    }

    if (allowedRoles.length === 0) {
      res.status(403).json({
        error: 'Access denied',
      });
      return;
    }

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
      const role =
        await resolveAuthenticatedRole(
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

      req.resolvedRole = role;

      next();
    } catch (error) {
      console.error(
        'Custom RBAC verification failed:',
        error,
      );

      res.status(503).json({
        error: 'Authorization service unavailable',
      });
    }
  };
}
