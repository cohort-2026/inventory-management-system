
import {
  useEffect,
  useRef,
  useState,
} from 'react';

import { Link } from 'react-router-dom';

import {
  customAuthEnabled,
} from '../services/authConfig';

import {
  verifyEmailToken,
} from '../services/emailVerificationApi';

type VerificationStatus =
  | 'verifying'
  | 'success'
  | 'error'
  | 'missing'
  | 'unsupported';

export default function VerifyEmailPage() {
  const [status, setStatus] =
    useState<VerificationStatus>('verifying');

  const [message, setMessage] = useState(
    'Verifying your email address...',
  );

  // Avoid submitting the same token twice in
  // React Strict Mode during development.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }

    started.current = true;

    if (!customAuthEnabled) {
      setStatus('unsupported');
      setMessage(
        'This verification page is only available with custom authentication.',
      );
      return;
    }

    const hash = window.location.hash.replace(
      /^#/,
      '',
    );

    const params = new URLSearchParams(hash);
    const token = params.get('token');

    // Immediately remove the token from the
    // browser address bar without reloading.
    if (hash) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname +
          window.location.search,
      );
    }

    if (
      !token ||
      !/^[a-f0-9]{64}$/.test(token)
    ) {
      setStatus('missing');
      setMessage(
        'This verification link is missing or invalid.',
      );
      return;
    }

    void verifyEmailToken(token)
      .then((responseMessage) => {
        setStatus('success');
        setMessage(responseMessage);
      })
      .catch((error: unknown) => {
        setStatus('error');

        setMessage(
          error instanceof Error
            ? error.message
            : 'Unable to verify your email address.',
        );
      });
  }, []);

  const successful = status === 'success';
  const verifying = status === 'verifying';

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
          Email verification
        </p>

        <div
          role="status"
          aria-live="polite"
          aria-busy={verifying}
        >
          <h2
            style={{
              fontSize: 'var(--text-lg)',
              marginBottom: 'var(--space-3)',
            }}
          >
            {verifying
              ? 'Verifying your email'
              : successful
                ? 'Email verified'
                : 'Verification unavailable'}
          </h2>

          <p
            style={{
              color: 'var(--color-text-muted)',
              marginBottom: 'var(--space-3)',
            }}
          >
            {message}
          </p>

          {verifying && (
            <p className="field-hint">
              Checking your verification link...
            </p>
          )}

          {successful ? (
            <Link
              to="/login"
              className="btn btn-primary auth-submit"
            >
              Continue to sign in
            </Link>
          ) : !verifying && customAuthEnabled ? (
            <Link
              to="/resend-verification"
              className="btn btn-primary auth-submit"
            >
              Request a new verification link
            </Link>
          ) : null}
        </div>

        <Link
          to="/login"
          className="auth-link"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
