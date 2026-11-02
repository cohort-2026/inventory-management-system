
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { customAuthEnabled } from '../services/authConfig';

import {
  requestPasswordReset,
} from '../services/passwordRecoveryApi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (submitting || !customAuthEnabled) {
      return;
    }

    setError('');

    const normalizedEmail = email.trim().toLowerCase();

    if (
      normalizedEmail.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(normalizedEmail)
    ) {
      setError('Enter a valid email address.');
      return;
    }

    setSubmitting(true);

    try {
      const responseMessage = await requestPasswordReset(
        normalizedEmail,
      );

      setMessage(responseMessage);
      setCompleted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to request password recovery.',
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
          Password recovery
        </p>

        {!customAuthEnabled ? (
          <div role="alert">
            <p className="field-hint">
              Password recovery is not currently available
              for this authentication provider.
            </p>
          </div>
        ) : completed ? (
          <div role="status" aria-live="polite">
            <div
              className="badge badge-ok"
              style={{
                marginBottom: 'var(--space-3)',
              }}
            >
              Request received
            </div>

            <h2
              style={{
                fontSize: 'var(--text-lg)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Check your email
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
              If your account is eligible, the reset
              email will contain a link valid for
              30 minutes. Check your spam folder
              if necessary.
            </p>

            <Link
              to="/login"
              className="btn btn-primary auth-submit"
            >
              Return to sign in
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
              Enter the email address associated with
              your account. If it is eligible for
              recovery, we will send instructions
              to that address.
            </p>

            <div className="field">
              <label
                className="field-label"
                htmlFor="forgot-email"
              >
                Email address
              </label>

              <input
                className="field-input"
                id="forgot-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                maxLength={254}
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                aria-invalid={!!error}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="field-error"
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
                ? 'Submitting request…'
                : 'Send password reset link'}
            </button>
          </form>
        )}

        <Link to="/login" className="auth-link">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
