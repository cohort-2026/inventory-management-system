
import type {
  Request,
  Response,
  NextFunction,
} from "express";

import { supabaseAuth } from "../config/supabaseAuthClient";

export type UserRole = "admin" | "staff" | "customer";

export interface AuthenticatedUser {
  id: string;
  username?: string;
  email?: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function isUserRole(value: unknown): value is UserRole {
  return (
    value === "admin" ||
    value === "staff" ||
    value === "customer"
  );
}

export async function supabaseRequireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Authentication required.",
    });
    return;
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    res.status(401).json({
      message: "Access token is missing.",
    });
    return;
  }

  try {
    const { data, error } =
      await supabaseAuth.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({
        message: "Invalid or expired access token.",
      });
      return;
    }

    // Use trusted application metadata, not user-editable metadata.
    const role = data.user.app_metadata?.role;

    if (!isUserRole(role)) {
      res.status(403).json({
        message: "No valid role assigned to this account.",
      });
      return;
    }

    req.user = {
      id: data.user.id,
      ...(data.user.email ? { email: data.user.email } : {}),
      role,
    };

    next();
  } catch (error) {
    console.error("Authentication verification failed:", error);

    res.status(500).json({
      message: "Unable to verify authentication.",
    });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        message: "Authentication required.",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        message: "Insufficient permissions.",
      });
      return;
    }

    next();
  };
}
