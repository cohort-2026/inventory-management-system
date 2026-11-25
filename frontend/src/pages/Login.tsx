import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Layers3,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';

type LoginScreenProps = {
  onSubmit: (email: string, password: string) => Promise<void>;
};

type FieldErrors = {
  email?: string;
  password?: string;
};

export function LoginScreen({ onSubmit }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function toggleVisibility() {
    setShowPassword((previous) => !previous);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);

    const next: FieldErrors = {};
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      next.email = 'Email is required';
    } else if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      next.email = 'Enter a valid email address';
    }

    if (!password) {
      next.password = 'Password is required';
    }

    setErrors(next);

    if (next.email || next.password) {
      return;
    }

    setSubmitting(true);

    try {
      await onSubmit(normalizedEmail, password);
    } catch {
      setLoginError('Incorrect email or password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="ims-login-page">
      <div className="ims-login-backdrop" aria-hidden="true" />

      <div className="ims-login-shell">
        <section className="ims-login-intro" aria-label="Inventory workspace introduction">
          <div className="ims-login-brand ims-login-brand--light">
            <span className="ims-login-brand-icon" aria-hidden="true">
              <Layers3 size={23} strokeWidth={2.1} />
            </span>
            <span className="ims-login-brand-name">INVENTORY <span>APP</span></span>
          </div>

          <div className="ims-login-intro-content">
            <span className="ims-login-eyebrow">
              <span className="ims-login-eyebrow-dot" />
              INVENTORY OPERATIONS WORKSPACE
            </span>
            <h1>Every product.<br /><span>Every movement.</span><br />One clear picture.</h1>
            <p>
              A secure workspace for inventory visibility, stock movements,
              and day-to-day warehouse operations.
            </p>

            <div className="ims-login-intro-feature">
              <span className="ims-login-feature-icon" aria-hidden="true">
                <ShieldCheck size={20} />
              </span>
              <div>
                <strong>Role-based access</strong>
                <span>Built for your team's operational workflow.</span>
              </div>
            </div>
          </div>

          <div className="ims-login-intro-footer">
            <span className="ims-login-footer-line" />
            <span>CONTROL · VISIBILITY · ACCOUNTABILITY</span>
          </div>
        </section>

        <section className="ims-login-form-panel" aria-labelledby="ims-login-title">
          <div className="ims-login-form-inner">
            <div className="ims-login-mobile-brand">
              <span className="ims-login-brand-icon" aria-hidden="true">
                <Layers3 size={21} />
              </span>
              <span className="ims-login-brand-name">INVENTORY <span>APP</span></span>
            </div>

            <div className="ims-login-form-heading">
              <span className="ims-login-form-kicker">WELCOME BACK</span>
              <h2 id="ims-login-title">Sign in to your account</h2>
              <p>Enter your credentials to access your workspace.</p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="ims-login-form">
              <div className="ims-login-field">
                <label htmlFor="email">Email address</label>
                <div className={`ims-login-input-wrap${errors.email ? ' ims-login-input-wrap--invalid' : ''}`}>
                  <Mail size={18} aria-hidden="true" className="ims-login-input-icon" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
                    }}
                    placeholder="you@business.com"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'ims-login-email-error' : undefined}
                    disabled={submitting}
                  />
                </div>
                {errors.email && (
                  <p id="ims-login-email-error" className="ims-login-field-error" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="ims-login-field">
                <div className="ims-login-field-heading">
                  <label htmlFor="password">Password</label>
                  <Link to="/forgot-password" className="ims-login-forgot">Forgot password?</Link>
                </div>
                <div className={`ims-login-input-wrap${errors.password ? ' ims-login-input-wrap--invalid' : ''}`}>
                  <LockKeyhole size={18} aria-hidden="true" className="ims-login-input-icon" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
                    }}
                    placeholder="Enter your password"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'ims-login-password-error' : undefined}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="ims-login-visibility"
                    onClick={toggleVisibility}
                    disabled={submitting}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="ims-login-password-error" className="ims-login-field-error" role="alert">
                    {errors.password}
                  </p>
                )}
              </div>

              <label className="ims-login-remember">
                <input type="checkbox" defaultChecked />
                <span>Remember me</span>
              </label>

              {loginError && (
                <div className="ims-login-auth-error" role="alert">
                  <span className="ims-login-error-dot" aria-hidden="true" />
                  <span>{loginError}</span>
                </div>
              )}

              <button type="submit" className="ims-login-submit" disabled={submitting}>
                <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
                {!submitting && <ArrowRight size={18} aria-hidden="true" />}
                {submitting && <span className="ims-login-spinner" aria-hidden="true" />}
              </button>
            </form>

            <div className="ims-login-form-footnote">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>Secure access to your inventory workspace</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default LoginScreen;
