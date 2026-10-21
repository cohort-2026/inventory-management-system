import type { NextFunction, Request, Response } from 'express';

export type ApplicationRole = 'manager' | 'inventory_staff' | 'viewer';

type RequestWithPrincipal = Request & {
  authenticatedUser?: { role: unknown };
  user?: { role: unknown };
};

function normalizeRole(value: unknown): ApplicationRole | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  switch (value.trim().toLowerCase()) {
    case 'manager':
    case 'admin':
      return 'manager';
    case 'inventory_staff':
    case 'inventory staff':
    case 'staff':
      return 'inventory_staff';
    case 'viewer':
    case 'user':
    case 'customer':
      return 'viewer';
    default:
      return undefined;
  }
}

export function requireRoles(...allowedRoles: ApplicationRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authenticatedRequest = req as RequestWithPrincipal;
    const principal =
      authenticatedRequest.authenticatedUser ?? authenticatedRequest.user;

    if (!principal) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const role = normalizeRole(principal.role);
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action' });
      return;
    }

    next();
  };
}
