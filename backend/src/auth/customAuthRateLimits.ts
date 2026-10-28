
import { rateLimit } from 'express-rate-limit';

const commonOptions = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  message: {
    error:
      'Too many requests. Please try again later.',
  },
};

export const registrationLimiter = rateLimit({
  ...commonOptions,
  limit: 5,
});

export const loginLimiter = rateLimit({
  ...commonOptions,
  limit: 10,
});

export const resendVerificationLimiter = rateLimit({
  ...commonOptions,
  limit: 5,
});

export const verifyEmailLimiter = rateLimit({
  ...commonOptions,
  limit: 20,
});

export const passwordResetRequestLimiter = rateLimit({
  ...commonOptions,
  limit: 5,
});

export const passwordResetConfirmLimiter = rateLimit({
  ...commonOptions,
  limit: 20,
});