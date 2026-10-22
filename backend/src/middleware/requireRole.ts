
import type { Request, Response, NextFunction } from "express";

export type UserRole = "admin" | "staff" | "customer";

export function requireRole(...allowedRoles: UserRole[]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        message: "Authentication required. Please log in.",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({
        message: "Forbidden. You do not have permission to perform this action.",
      });
      return;
    }

    next();
  };
}
