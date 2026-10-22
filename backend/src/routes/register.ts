import express from 'express';
import bcrypt from 'bcrypt';
import { findUser, addUser } from '../models/userStore';

const router = express.Router();
const SALT_ROUNDS = 12;

router.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || !username.trim()) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }
  const normalizedUsername = username.trim();
  if (findUser(normalizedUsername)) {
    res.status(409).json({ error: 'That username is already taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  addUser({ username: normalizedUsername, passwordHash, role: 'viewer' });

  res.status(201).json({ message: 'Account created', user: { username: normalizedUsername } });
});

export default router;