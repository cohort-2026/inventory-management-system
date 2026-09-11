import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { findUser, addUser } from '../models/userStore';
import { requireAuth } from '../middleware/requireAuth';

const router = express.Router();
const SALT_ROUNDS = 12;

router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ error: 'username is required' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }
  if (findUser(username)) {
    return res.status(409).json({ error: 'That username is already taken' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  addUser({ username, passwordHash, role: 'user' });

  res.status(201).json({ message: 'Account created' });
});

export default router;