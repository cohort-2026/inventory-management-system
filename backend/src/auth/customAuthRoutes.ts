
import { Router } from 'express';
import customRbacTestRoutes from './customRbacTestRoutes';

import {
  registerUser,
  authenticateUser,
  AuthServiceError,
} from './authService';

import {
  createSession,
  revokeSession,
} from './sessionService';

import {
  CUSTOM_SESSION_COOKIE,
  setCustomSessionCookie,
  clearCustomSessionCookie,
} from './customSessionCookies';

import {
  requireSession,
} from '../middleware/requireSession';

import type {
  SessionAuthenticatedRequest,
} from '../middleware/requireSession';

const router = Router();

const FRONTEND_URL =
  process.env.FRONTEND_URL ??
  'http://localhost:5173';

// Development safeguard for state-changing requests.
// Production will need comprehensive CSRF protection.
router.use((req, res, next) => {
  if (
    !['POST', 'PUT', 'PATCH', 'DELETE'].includes(
      req.method,
    )
  ) {
    next();
    return;
  }

  const origin = req.headers.origin;

  if (origin && origin !== FRONTEND_URL) {
    res.status(403).json({
      error: 'Request origin not allowed',
    });
    return;
  }

  // Reject ordinary browser form submissions.
  // Require JSON for all state-changing requests.
  if (!req.is('application/json')) {
    res.status(415).json({
      error: 'Application/json required',
    });
    return;
  }

  next();
});

// POST /api/custom-auth/register
router.post('/register', async (req, res) => {
  try {
    const user = await registerUser(
      req.body ?? {},
    );

    res.status(202).json({
      message:
        'Registration accepted. Email verification is required before login.',
      confirmationRequired: true,
      user: {
        id: user.id,
        email: user.email,
        roleId: user.roleId,
        status: user.status,
      },
    });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
      return;
    }

    console.error('Custom registration failed:', error);

    res.status(503).json({
      error: 'Registration service unavailable',
    });
  }
});

// POST /api/custom-auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    res.status(400).json({
      error: 'Email and password are required',
    });
    return;
  }

  try {
    const user = await authenticateUser(
      email,
      password,
    );

    if (!user) {
      // Do not disclose whether the email exists,
      // the password is wrong or verification is pending.
      res.status(401).json({
        error: 'Invalid credentials or account unavailable',
      });
      return;
    }

    const session = await createSession(user.id);

    setCustomSessionCookie(res, session);

    res.status(200).json({
      user,
    });
  } catch (error) {
    console.error('Custom login failed:', error);

    res.status(503).json({
      error: 'Authentication service unavailable',
    });
  }
});

// GET /api/custom-auth/me
router.get(
  '/me',
  requireSession,
  (
    req: SessionAuthenticatedRequest,
    res,
  ) => {
    res.status(200).json({
      user: req.authenticatedUser,
    });
  },
);

// POST /api/custom-auth/logout
router.post('/logout', async (req, res) => {
  const token: unknown =
    req.cookies?.[CUSTOM_SESSION_COOKIE];

  try {
    if (typeof token === 'string') {
      await revokeSession(token);
    }

    clearCustomSessionCookie(res);

    res.status(200).json({
      message: 'Signed out successfully',
    });
  } catch (error) {
    console.error('Custom logout failed:', error);

    res.status(503).json({
      error: 'Logout service unavailable',
    });
  }
});

if (process.env.NODE_ENV === 'development') {
    router.use(
        '/rbac-test',
        customRbacTestRoutes,
    )
}

export default router;
