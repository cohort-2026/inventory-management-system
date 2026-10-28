
import {
  useEffect,
  useState,
} from 'react';

import type { FormEvent } from 'react';

import { Link } from 'react-router-dom';

import { customAuthEnabled } from '../services/authConfig';

import {
  confirmPasswordReset,
} from '../services/passwordRecoveryApi';

type ResetStatus =
  | 'ready'
  | 'missing'
  | 'success'
  | 'unsupported';

function readResetToken(): string | null {
  const fragment = window.location.hash.replace(
    /^#/,
    '',
  );

  const token = new URLSearchParams(
    fragment,
  ).get('token');

  // Remove the sensitive fragment from the address
  // bar, without navigating away from the page.
  if (fragment) {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname +
        window.location.search,
    );
  }

  return token && /^[a-f0-9]{64}$/.test(token)
    ? token
    : null;
}

export default function ResetPasswordPage() {
  const [token] = useState<string | null>(() =>
    customAuthEnabled ? readResetToken() : null,
  );

  const [status, setStatus] = useState<ResetStatus>(
    !customAuthEnabled
      ? 'unsupported'
      : token
        ? 'ready'
        : 'missing',
  );

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmation, setShowConfirmation] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // The token is intentionally kept in component
  // memory, not localStorage or sessionStorage.
  useEffect(() => {
    if (status === 'success') {
      setPassword('');
      setConfirmPassword('');
    }
  }, [status]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (
      submitting ||
      status !== 'ready' ||
      !token
    ) {
      return;
    }

    setError('');

    if (
      password.length < 8 ||
      new TextEncoder().encode(password).length > 1024
    ) {
      setError(
        'Password must contain at least 8 characters and be within the allowed length.',
      );
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const result = await confirmPasswordReset(
        token,
        password,
      );

      setMessage(result);
      setStatus('success');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to reset your password.',
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
          Reset your password
        </p>

        {status === 'unsupported' ? (
          <div role="alert">
            <p className="field-hint">
              This page is available when custom
              authentication is enabled.
            </p>
          </div>
        ) : status === 'missing' ? (
          <div role="alert">
            <h2
              style={{
                fontSize: 'var(--text-lg)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Invalid reset link
            </h2>

            <p
              style={{
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-3)',
              }}
            >
              This password reset link is missing
              or malformed. Request a new link
              to continue.
            </p>

            <Link
              to="/forgot-password"
              className="btn btn-primary auth-submit"
            >
              Request a new link
            </Link>
          </div>
        ) : status === 'success' ? (
          <div role="status" aria-live="polite">
            <div
              className="badge badge-ok"
              style={{
                marginBottom: 'var(--space-3)',
              }}
            >
              Password updated
            </div>

            <h2
              style={{
                fontSize: 'var(--text-lg)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Reset successful
            </h2>

            <p
              style={{
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-3)',
              }}
            >
              {message}
            </p>

            <p className="field-hint">
              All previous login sessions have been
              invalidated. Sign in again with your
              new password.
            </p>

            <Link
              to="/login"
              className="btn btn-primary auth-submit"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
          >
            <p
              style={{
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-3)',
              }}
            >
              Choose a new password for your account.
              Your reset link can only be used once
              and expires after 30 minutes.
            </p>

            <div className="field">
              <label
                className="field-label"
                htmlFor="reset-password"
              >
                New password
              </label>

              <div style={{ position: 'relative' }}>
                <input
                  className="field-input"
                  id="reset-password"
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  style={{
                    paddingRight: 70,
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  aria-label={
                    showPassword
                      ? 'Hide new password'
                      : 'Show new password'
                  }
                  aria-pressed={showPassword}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <p className="field-hint">
                At least 8 characters.
              </p>
            </div>

            <div className="field">
              <label
                className="field-label"
                htmlFor="reset-confirm"
              >
                Confirm new password
              </label>

              <div style={{ position: 'relative' }}>
                <input
                  className="field-input"
                  id="reset-confirm"
                  type={
                    showConfirmation
                      ? 'text'
                      : 'password'
                  }
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  style={{
                    paddingRight: 70,
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmation(
                      (current) => !current,
                    )
                  }
                  aria-label={
                    showConfirmation
                      ? 'Hide password confirmation'
                      : 'Show password confirmation'
                  }
                  aria-pressed={showConfirmation}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {showConfirmation ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <p
                className="field-error"
                role="alert"
                style={{
                  marginBottom: 'var(--space-3)',
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={submitting}
            >
              {submitting
                ? 'Updating password…'
                : 'Reset password'}
            </button>

            <p
              className="field-hint"
              style={{
                marginTop: 'var(--space-3)',
              }}
            >
              If your reset link has expired
              or was already used, request
              another one.
            </p>
          </form>
        )}

        <Link
          to="/forgot-password"
          className="auth-link"
        >
          Request another reset link
        </Link>
      </div>
    </main>
  );
}
