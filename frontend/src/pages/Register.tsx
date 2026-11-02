
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../utils/AuthContext';
import { customAuthEnabled } from '../services/authConfig';

type Errors = Partial<
  Record<
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'password'
    | 'confirmPassword',
    string
  >
>;

export default function Register() {
  const { register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [completed, setCompleted] = useState<{
    confirmationRequired: boolean;
    message: string;
  } | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting) return;

    setServerError('');

    const next: Errors = {};

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }

    if (password.length < 8) {
      next.password =
        'Password must contain at least 8 characters.';
    }

    if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match.';
    }

    if (!firstName.trim()) {
      next.firstName = 'First name is required.';
    } else if (firstName.trim().length > 100) {
      next.firstName = 'First name is too long.';
    }

    if (!lastName.trim()) {
      next.lastName = 'Last name is required.';
    } else if (lastName.trim().length > 100) {
      next.lastName = 'Last name is too long.';
    }

    setErrors(next);

    if (Object.keys(next).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await register(
        email.trim(),
        password,
        firstName.trim(),
        lastName.trim(),
      );

      setCompleted(result);
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'Unable to create account. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div
        className="auth-card"
        style={{ maxWidth: 480 }}
      >
        <div className="auth-brand">
          <span
            className="auth-brand-mark"
            aria-hidden="true"
          />
          <h1>Inventory App</h1>
        </div>

        <p className="auth-subtitle">
          Create your account
        </p>

        {/* REGISTRATION SUCCESS */}
        {completed ? (
          <div
            role="status"
            aria-live="polite"
          >
            <div
              className="badge badge-ok"
              style={{
                marginBottom: 'var(--space-3)',
              }}
            >
              Registration received
            </div>

            <h2
              style={{
                fontSize: 'var(--text-lg)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Check your next steps
            </h2>

            
            <p
              style={{
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-3)',
              }}
            >
              {customAuthEnabled ? (
                <>
                  {completed.message}
                  <span
                    style={{
                      display: 'block',
                      marginTop: 'var(--space-2)',
                    }}
                  >
                    Your account will receive Viewer
                    permissions by default. You must
                    verify your email before signing in.
                  </span>
                </>
              ) : completed.confirmationRequired ? (
                <>
                  Please check your email for a
                  confirmation link before signing in.
                  Check your spam folder if needed.
                </>
              ) : (
                <>
                  Your registration has been submitted.
                  You can now try signing in.
                </>
              )}
            </p>

            <p className="field-hint">
              New accounts receive Viewer access
              by default. A Manager can change
              your role later.
            </p>

            <Link
              className="btn btn-primary auth-submit"
              to="/login"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          /* REGISTRATION FORM */
          <form
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="field-row">
              <div className="field">
                <label
                  className="field-label"
                  htmlFor="register-first"
                >
                  First name
                </label>

                <input
                  className="field-input"
                  id="register-first"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) =>
                    setFirstName(e.target.value)
                  }
                  aria-invalid={!!errors.firstName}
                />

                {errors.firstName && (
                  <p className="field-error">
                    {errors.firstName}
                  </p>
                )}
              </div>

              <div className="field">
                <label
                  className="field-label"
                  htmlFor="register-last"
                >
                  Last name
                </label>

                <input
                  className="field-input"
                  id="register-last"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) =>
                    setLastName(e.target.value)
                  }
                  aria-invalid={!!errors.lastName}
                />

                {errors.lastName && (
                  <p className="field-error">
                    {errors.lastName}
                  </p>
                )}
              </div>
            </div>

            <div className="field">
              <label
                className="field-label"
                htmlFor="register-email"
              >
                Email
              </label>

              <input
                className="field-input"
                id="register-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                aria-invalid={!!errors.email}
              />

              {errors.email && (
                <p className="field-error">
                  {errors.email}
                </p>
              )}
            </div>

            <div className="field">
              <label
                className="field-label"
                htmlFor="register-password"
              >
                Password
              </label>

              <input
                className="field-input"
                id="register-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                aria-invalid={!!errors.password}
              />

              <p className="field-hint">
                At least 8 characters.
              </p>

              {errors.password && (
                <p className="field-error">
                  {errors.password}
                </p>
              )}
            </div>

            <div className="field">
              <label
                className="field-label"
                htmlFor="register-confirm"
              >
                Confirm password
              </label>

              <input
                className="field-input"
                id="register-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                aria-invalid={!!errors.confirmPassword}
              />

              {errors.confirmPassword && (
                <p className="field-error">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <p
              className="field-hint"
              style={{
                marginBottom: 'var(--space-3)',
              }}
            >
              All public registrations begin with
              Viewer permissions. Role upgrades
              require a Manager.
            </p>

            {serverError && (
              <p
                role="alert"
                className="field-error"
                style={{
                  marginBottom: 'var(--space-3)',
                }}
              >
                {serverError}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={submitting}
            >
              {submitting
                ? 'Creating account…'
                : 'Create account'}
            </button>
          </form>
        )}

        {customAuthEnabled && (
          <p
            className="field-hint"
            style={{
              marginBottom: 'var(--space-3)',
            }}
          >
            Didn't receive a verification email?{' '}
            <Link to="/resend-verification">
              Request another verification link
            </Link>
          </p>
        )}

        <Link
          to="/login"
          className="auth-link"
        >
          Already registered? Sign in
        </Link>
      </div>
    </main>
  );
}
