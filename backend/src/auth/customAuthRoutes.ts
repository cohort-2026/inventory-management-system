
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

import {
  sendVerificationEmail,
  resendVerificationEmail,
  verifyEmailAddress,
} from './emailVerificationService';

import {
  registrationLimiter,
  loginLimiter,
  resendVerificationLimiter,
  verifyEmailLimiter,
  passwordResetRequestLimiter,
  passwordResetConfirmLimiter,
} from './customAuthRateLimits';

import {
  requestPasswordReset,
  resetPassword,
} from './passwordResetService';

import {
  resolveAuthenticatedRole,
} from '../middleware/customRequireRole';

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

router.post(
  '/register',
  registrationLimiter,
  (req, res, next) => {
    // Public registration is disabled by default. Demo-only opt-in is restricted
    // to local development; production accounts require an admin-managed path.
    if (process.env.NODE_ENV !== 'production' &&
        process.env.ALLOW_PUBLIC_REGISTRATION === 'true') {
      next();
      return;
    }
    res.status(403).json({
      error: 'Public registration is disabled. Contact an administrator for access.',
    });
  },
  async (req, res) => {
    try {
      const user = await registerUser(
        req.body ?? {},
      );

      let emailSent = false;

      try {
        await sendVerificationEmail(
          user.id,
          user.email,
        );

        emailSent = true;
      } catch (mailError) {
        // The account was already committed to
        // PostgreSQL. Don't pretend it wasn't.
        //
        // Keep the account pending verification
        // and allow the user to resend later.
        console.error(
          'Registration verification email failed:',
          mailError instanceof Error
            ? mailError.message
            : 'Unknown mail error',
        );
      }

      res.status(202).json({
        message: emailSent
          ? 'Account created. Check your email for a verification link.'
          : 'Account created, but the verification email could not be sent. Please try resending shortly.',
        confirmationRequired: true,
        emailDelivery: emailSent
          ? 'sent'
          : 'failed',
      });
    } catch (error) {
      if (error instanceof AuthServiceError) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      console.error(
        'Custom registration failed:',
        error,
      );

      res.status(503).json({
        error:
          'Registration service unavailable',
      });
    }
  },
);


// POST /api/resend-verification
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  async (req, res) => {
    const email: unknown =
      req.body?.email;

    try {
      await resendVerificationEmail(email);
    } catch (error) {
      // Avoid exposing SMTP or account state
      // through this public-facing response.
      console.error(
        'Verification resend failed:',
        error instanceof Error
          ? error.message
          : 'Unknown error',
      );
    }

    res.status(202).json({
      message:
        'If the account exists and still needs verification, a confirmation email will be sent when eligible.',
    });
  },
);

// POST /api/verify-email
router.post(
  '/verify-email',
  verifyEmailLimiter,
  async (req, res) => {
    const token: unknown =
      req.body?.token;

    try {
      const verified =
        await verifyEmailAddress(token);

      if (!verified) {
        res.status(400).json({
          error:
            'Verification link is invalid, expired, or has already been used.',
        });
        return;
      }

      res.status(200).json({
        message:
          'Email verified successfully. You can now sign in.',
      });
    } catch (error) {
      console.error(
        'Email verification failed:',
        error instanceof Error
          ? error.message
          : 'Unknown error',
      );

      res.status(503).json({
        error:
          'Verification service unavailable',
      });
    }
  },
);


// POST /api/custom-auth/login
router.post(
  '/login',
  loginLimiter,
  async (req, res) => {
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
        error:
          'Unable to sign in. Check your email and password, ' +
          'and make sure your email address has been verified.',
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
},
);


// GET /api/custom-auth/me
router.get(
  '/me',
  requireSession,
  async (
    req: SessionAuthenticatedRequest,
    res,
  ): Promise<void> => {
    const user = req.authenticatedUser;

    if (!user) {
      res.status(401).json({
        error: 'Authentication required',
      });
      return;
    }

    try {
      const roleName = await resolveAuthenticatedRole(
        user.roleId,
      );

      res.status(200).json({
        user: {
          ...user,
          roleName,
        },
      });
    } catch (error) {
      console.error('Resolve user role failed:', error);

      res.status(503).json({
        error: 'Unable to retrieve account permissions.',
      });
    }
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

// POST /api/custom-auth/forgot-password
router.post(
  '/forgot-password',
  passwordResetRequestLimiter,
  async (req, res) => {
    const email: unknown = req.body?.email;

    try {
      await requestPasswordReset(email);
    } catch (error) {
      // an account exists to the requester.
      console.error(
        'Password recovery request failed:',
        error instanceof Error
          ? error.message
          : 'Unknown error',
      );
    }

    // unknown, verified and unverified emails.
    res.status(202).json({
      message:
        "If an eligible account exists for that address, a password reset email will be sent when eligible.",
    });
  },
);

// POST api/custom-auth/reset-password
router.post(
  '/reset-password',
  passwordResetConfirmLimiter,
  async (req, res) => {
    const token: unknown = req.body?.token;
    const newPassword: unknown =
      req.body?.newPassword;

    if (
      typeof newPassword !== 'string' ||
      newPassword.length < 8 ||
      Buffer.byteLength(newPassword, 'utf8') > 1024
    ) {
      res.status(400).json({
        error:
          'Password must be at least 8 characters and within the allowed length.',
      });
      return;
    }

    if (
      typeof token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(token)
    ) {
      res.status(400).json({
        error:
          'Password reset link is invalid or expired.',
      });
      return;
    }

    try {
      const success = await resetPassword(
        token,
        newPassword,
      );

      if (!success) {
        res.status(400).json({
          error:
            'Password reset link is invalid, expired or already used.',
        });
        return;
      }

      res.status(200).json({
        message:
          'Password updated successfully. Please sign in again.',
      });
    } catch (error) {
      console.error(
        'Password reset failed:',
        error instanceof Error
          ? error.message
          : 'Unknown error',
      );

      res.status(503).json({
        error:
          'Password reset service unavailable.',
      });
    }
  }
)

export default router;
