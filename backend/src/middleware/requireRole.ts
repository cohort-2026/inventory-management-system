import { Request, Response, NextFunction } from 'express';

export function requireRole(role: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;

        if (!user) {
            return res.status(401).json({ error: 'Not signed in' });
        }
        if (user.role !== role) {
            return res.status(403).json({ error: 'Not allowed' });
        }
        next();
    }
}