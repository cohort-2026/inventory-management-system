
import { Router } from 'express';

import { supabaseAuth } from './supabaseAuthClient';

import {
  clearSessionCookies,
  findActiveProfile,
  setSessionCookies,
  supabaseCookieAuth,
} from './supabaseCookieAuth';

import type {
  CookieAuthenticatedRequest,
} from './supabaseCookieAuth';

import supabaseRbacTestRoutes from './supabaseRbacTestRoutes';

const router = Router();

// Origin validation for state-changing requests.
router.use((req, res, next) => {
  if (
    !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
  ) {
    next();
    return;
  }

  const origin = req.headers.origin;

  const allowedOrigin =
    process.env.FRONTEND_URL ??
    'http://localhost:5173';

  if (origin && origin !== allowedOrigin) {
    res.status(403).json({
      error: 'Request origin not allowed',
    });
    return;
  }

  next();
});

// Register through Supabase Authentication.
router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    !/^\S+@\S+\.\S+$/.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < 8 ||
    typeof firstName !== 'string' ||
    !firstName.trim() ||
    firstName.trim().length > 100 ||
    typeof lastName !== 'string' ||
    !lastName.trim() ||
    lastName.trim().length > 100
  ) {
    res.status(400).json({
      error: 'Valid email, password (at least 8 characters), first name and last name are required',
    });
    return;
  }

  try {
    const { data, error } = await supabaseAuth.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      },
    });

    if (error) {
      const duplicate = error.code === 'user_already_exists' ||
        /already registered|already exists/i.test(error.message);
      res.status(duplicate ? 409 : error.status === 429 ? 429 : 400).json({
        error: duplicate
          ? 'This email is already registered. Please sign in instead.'
          : error.message,
      });
      return;
    }

    // With email confirmation enabled, Supabase may return a fake user
    // for an existing email to discourage account enumeration.
    // A fake signup user typically has an empty identities array.
    if (data.user && Array.isArray(data.user.identities) &&
        data.user.identities.length === 0) {
      res.status(409).json({
        error: 'This email is already registered. Please sign in instead.',
      });
      return;
    }

    if (!data.user) {
      res.status(503).json({ error: 'Registration could not be verified. Please try again.' });
      return;
    }

    res.status(202).json({
      message: 'Registration submitted',
      confirmationRequired: !data.session,
    });
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(503).json({ error: 'Authentication service unavailable' });
  }
});

// Login and establish an HTTP-only session.
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    !email.trim() ||
    typeof password !== 'string' ||
    !password
  ) {
    res.status(400).json({
      error: 'Email and password are required',
    });
    return;
  }

  try {
    const { data, error } =
      await supabaseAuth.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (error || !data.session || !data.user) {
      res.status(401).json({
        error: 'Invalid credentials or unconfirmed account',
      });
      return;
    }

    const profile = await findActiveProfile(data.user.id);

    if (!profile || profile.status !== 'active') {
      res.status(403).json({
        error: 'Application account unavailable',
      });
      return;
    }

    setSessionCookies(res, data.session);

    res.status(200).json({
      user: {
        id: data.user.id,
        email: data.user.email,
        roleId: profile.role_id,
        status: profile.status,
      },
    });
  } catch (error) {
    console.error('Supabase login failed:', error);

    res.status(503).json({
      error: 'Authentication service unavailable',
    });
  }
});

// Restore the authenticated browser session.
router.get(
  '/me',
  supabaseCookieAuth,
  (req: CookieAuthenticatedRequest, res) => {
    res.status(200).json({
      user: req.authenticatedUser,
    });
  },
);

// Clear the browser session.
router.post('/logout', (_req, res) => {
  clearSessionCookies(res);

  res.status(200).json({
    message: 'Local session cleared',
  });
});

if (process.env.NODE_ENV !== 'production') {
  router.use('/rbac-test', supabaseRbacTestRoutes);
}

export default router;
