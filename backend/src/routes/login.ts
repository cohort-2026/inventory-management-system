import { JWT_SECRET } from '../config';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { requireAuth } from '../middleware/requireAuth';
import { findUser } from '../models/userStore';

const router = express.Router();

// const FAKE_USER = {
//         username: 'admin',
//         password: '$2b$10$Aj37q1FLEdFvD60I3v2OJeWI/vVCq6cTBnLvGLJmlNAJWatGT4MmG'
//     }

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const genericError = { error: 'Invalid username or password' };

  const user = findUser(username);
  if (!user) return res.status(401).json(genericError);

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) return res.status(401).json(genericError);

  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const token = jwt.sign(
    { username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({ message: 'Login successful' });
});

router.get('/me', requireAuth, (req, res) => {
    res.json({ user: (req as any).user });
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

export default router;