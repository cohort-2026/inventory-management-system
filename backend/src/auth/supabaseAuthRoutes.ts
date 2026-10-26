
import { Router } from 'express';

import { supabaseAdmin, supabaseAuth } from './supabaseAuthClient';

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
  const {
    email,
    password,
    firstName,
    lastName,
  } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    !email.trim() ||
    typeof password !== 'string' ||
    password.length < 8 ||
    (firstName !== undefined &&
      typeof firstName !== 'string') ||
    (lastName !== undefined &&
      typeof lastName !== 'string')
  ) {
    res.status(400).json({
      error: 'Valid registration details required',
    });
    return;
  }

  try {
    const { data, error } =
      await supabaseAuth.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName ?? '',
            last_name: lastName ?? '',
          },
        },
      });

    if (error) {
      res.status(error.status === 429 ? 429 : 400).json({
        error: error.message,
      });
      return;
    }

    res.status(202).json({
      message: 'Registration submitted',
      confirmationRequired: !data.session,
    });
  } catch (error) {
    console.error('Registration failed:', error);

    res.status(503).json({
      error: 'Authentication service unavailable',
    });
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

// Ask Supabase to email a password reset link.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    !/^\S+@\S+\.\S+$/.test(email.trim())
  ) {
    res.status(400).json({
      error: 'A valid email is required',
    });
    return;
  }

  const frontendUrl =
    process.env.FRONTEND_URL ??
    'http://localhost:5173';

  try {
    const { error } =
      await supabaseAuth.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${frontendUrl}/reset-password`,
        },
      );

    if (error?.status === 429) {
      res.status(429).json({
        error: 'Too many requests. Please try again later.',
      });
      return;
    }

    if (error) {
      // Log it for the team, but tell the caller nothing about the account.
      console.error('Password reset email failed:', error.message);
    }

    // The same answer whether or not the email has an account.
    res.status(200).json({
      message:
        'If an account exists for that email, a reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password failed:', error);

    res.status(503).json({
      error: 'Authentication service unavailable',
    });
  }
});

// Save a new password using the token from the reset email link.
router.post('/reset-password', async (req, res) => {
  const { accessToken, newPassword } = req.body ?? {};

  if (
    typeof accessToken !== 'string' ||
    !accessToken ||
    typeof newPassword !== 'string' ||
    newPassword.length < 8
  ) {
    res.status(400).json({
      error:
        'A reset token and a password of at least 8 characters are required',
    });
    return;
  }

  try {
    // 1. Check the token belongs to a real user.
    const { data, error: tokenError } =
      await supabaseAuth.auth.getUser(accessToken);

    if (tokenError || !data.user) {
      res.status(401).json({
        error: 'This reset link is invalid or has expired',
      });
      return;
    }

    // 2. Save the new password for that user.
    const { error } =
      await supabaseAdmin.auth.admin.updateUserById(
        data.user.id,
        { password: newPassword },
      );

    if (error) {
      res.status(400).json({
        error: 'Could not update the password',
      });
      return;
    }

    // No session cookies here: the user logs in again with the new password.
    clearSessionCookies(res);

    res.status(200).json({
      message: 'Password updated',
    });
  } catch (error) {
    console.error('Reset password failed:', error);

    res.status(503).json({
      error: 'Authentication service unavailable',
    });
  }
});

if (process.env.NODE_ENV !== 'production') {
  router.use('/rbac-test', supabaseRbacTestRoutes);
}

export default router;
