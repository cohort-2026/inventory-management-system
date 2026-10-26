import { useState } from 'react';
import type { FormEvent } from 'react';

const API_URL =
  import.meta.env.VITE_PASSWORD_RESET_API_URL ?? 'http://localhost:5001';

const recoveryParams = new URLSearchParams(window.location.hash.slice(1));
const recoveryToken =
  recoveryParams.get('type') === 'recovery'
    ? recoveryParams.get('access_token')
    : null;

type Mode = 'request' | 'update' | 'sent' | 'updated';

export default function ForgotPassword() {
  const [mode, setMode] = useState<Mode>(
    recoveryToken ? 'update' : 'request',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(
    recoveryParams.get('error_description'),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/forgot-password/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Could not send the reset email.');
      }

      setMessage(data.message ?? 'If the account exists, a reset link will be sent.');
      setMode('sent');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not send the reset email. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!recoveryToken) {
      setError('The reset link is missing or invalid. Request a new one.');
      return;
    }
    if (password.length < 8) {
      setError('Your password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/forgot-password/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: recoveryToken, password }),
      });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Could not update your password.');
      }

      window.history.replaceState(null, '', window.location.pathname);
      setMessage(data.message ?? 'Your password has been updated.');
      setMode('updated');
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Could not update your password. Request a new reset link.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const heading =
    mode === 'update'
      ? 'Choose a new password'
      : mode === 'updated'
        ? 'Password updated'
        : mode === 'sent'
          ? 'Check your email'
          : 'Forgot your password?';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f4f7fb',
        fontFamily: 'Arial, sans-serif',
        padding: 20,
      }}
    >
      <section
        style={{
          width: 'min(100%, 400px)',
          boxSizing: 'border-box',
          background: '#fff',
          border: '1px solid #e1e7ef',
          borderRadius: 12,
          padding: 32,
          boxShadow: '0 12px 36px #142d4a12',
        }}
      >
        <h1 style={{ margin: '0 0 8px', color: '#172b4d', fontSize: 24 }}>
          {heading}
        </h1>
        <p style={{ margin: '0 0 24px', color: '#5d6b82', lineHeight: 1.5 }}>
          {mode === 'update'
            ? 'Enter and confirm your new password below.'
            : mode === 'updated'
              ? 'You can now sign in with your new password.'
              : mode === 'sent'
                ? 'If an account exists for that email, a password reset link is on its way.'
                : 'Enter your account email and we’ll send you a password reset link.'}
        </p>

        {mode === 'request' && (
          <form onSubmit={handleRequest}>
            <label
              htmlFor="reset-email"
              style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}
            >
              Email address
            </label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={submitting} style={buttonStyle}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        {mode === 'update' && (
          <form onSubmit={handleUpdate}>
            <label
              htmlFor="new-password"
              style={{ display: 'block', marginBottom: 6, fontWeight: 700 }}
            >
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />
            <label
              htmlFor="confirm-password"
              style={{ display: 'block', margin: '16px 0 6px', fontWeight: 700 }}
            >
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={submitting} style={buttonStyle}>
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        {message && (
          <p role="status" style={{ color: '#216e39', lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: '#b42318', lineHeight: 1.5 }}>
            {error}
          </p>
        )}

        <a
          href="/login"
          style={{
            display: 'inline-block',
            marginTop: 20,
            color: '#3566a3',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Back to sign in
        </a>
      </section>
    </main>
  );
}

const inputStyle = {
  boxSizing: 'border-box' as const,
  width: '100%',
  height: 44,
  border: '1px solid #aab6c5',
  borderRadius: 6,
  padding: '0 12px',
  fontSize: 16,
};

const buttonStyle = {
  width: '100%',
  minHeight: 44,
  marginTop: 20,
  border: 0,
  borderRadius: 6,
  background: '#3566a3',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};
