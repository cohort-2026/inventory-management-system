import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { JWT_SECRET } from '../config';

type LocalAuthRequest = Request & {
  cookies?: Record<string, unknown>;
  user?: {
    id: string;
    username?: string;
    role: SessionRole;
  };
};

type SessionRole = 'admin' | 'staff' | 'customer';

function normalizeRole(value: unknown): SessionRole | undefined {
  switch (value) {
    case 'manager':
    case 'admin':
      return 'admin';
    case 'inventory_staff':
    case 'staff':
      return 'staff';
    case 'viewer':
    case 'user':
    case 'customer':
      return 'customer';
    default:
      return undefined;
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authenticatedRequest = req as LocalAuthRequest;
  const token = authenticatedRequest.cookies?.token;

  if (typeof token !== 'string' || !token) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload === 'string') {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    const claims = payload as JwtPayload;
    const username = typeof claims.username === 'string' ? claims.username : undefined;
    const role = normalizeRole(claims.role);
    if (!username || !role) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }

    authenticatedRequest.user = { id: username, username, role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}