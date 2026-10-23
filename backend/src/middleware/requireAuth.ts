import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Not signed in' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        (req as any).user = payload;
        next();
    } catch {
            return res.status(401).json({ error: 'Invalid or expired session' });
    }
}