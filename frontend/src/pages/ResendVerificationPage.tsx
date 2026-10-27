
import { useState } from 'react';
import type { FormEvent } from 'react';

import { Link } from 'react-router-dom';

import {
  customAuthEnabled,
} from '../services/authConfig';

import {
  requestVerificationResend,
} from '../services/emailVerificationApi';

export default function ResendVerificationPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] =
    useState(false);

  const [completed, setCompleted] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const [error, setError] =
    useState('');

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (submitting || !customAuthEnabled) {
      return;
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    if (
      !/^\S+@\S+\.\S+$/.test(normalizedEmail)
    ) {
      setError('Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const result =
        await requestVerificationResend(
          normalizedEmail,
        );

      setMessage(result);
      setCompleted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to request verification.',
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
          Resend verification email
        </p>

        {!customAuthEnabled ? (
          <p className="field-hint">
            This page is available when
            custom authentication is enabled.
          </p>
        ) : completed ? (
          <div
            role="status"
            aria-live="polite"
          >
            <h2
              style={{
                fontSize: 'var(--text-lg)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Request received
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
              If you don't receive an email,
              check your spam folder. You can
              request another link later.
            </p>

            <Link
              to="/login"
              className="btn btn-primary auth-submit"
            >
              Back to sign in
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
              Enter the email address you
              registered with. If the account
              still needs verification, we'll
              send a new link when eligible.
            </p>

            <div className="field">
              <label
                className="field-label"
                htmlFor="resend-email"
              >
                Email address
              </label>

              <input
                className="field-input"
                id="resend-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
              />
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
                ? 'Sending request…'
                : 'Resend verification email'}
            </button>
          </form>
        )}

        <Link
          to="/login"
          className="auth-link"
        >
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
