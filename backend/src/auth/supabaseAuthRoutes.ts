import { Router } from 'express';
import { supabaseAuth } from './supabaseAuthClient';
import { supabaseRequireAuth, type AuthenticatedRequest } from './supabaseRequireAuth';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim() ||
      typeof password !== 'string' || password.length < 8 ||
      (firstName !== undefined && typeof firstName !== 'string') ||
      (lastName !== undefined && typeof lastName !== 'string')) {
    res.status(400).json({ error: 'Valid email, password (at least 8 characters), and optional names required' });
    return;
  }

  const { data, error } = await supabaseAuth.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { first_name: firstName ?? '', last_name: lastName ?? '' } },
  });
  if (error) {
    res.status(error.status === 429 ? 429 : 400).json({ error: error.message });
    return;
  }

  res.status(202).json({
    message: 'Registration submitted. Check your email if confirmation is enabled.',
    confirmationRequired: !data.session,
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: email.trim(), password,
  });
  if (error || !data.session) {
    res.status(401).json({ error: 'Invalid credentials or unconfirmed account' });
    return;
  }

  res.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in,
    tokenType: data.session.token_type,
  });
});

router.get('/me', supabaseRequireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.authenticatedUser });
});

export default router;
