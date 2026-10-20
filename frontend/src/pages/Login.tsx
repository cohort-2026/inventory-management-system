import { useState } from "react";
import type { FormEvent } from "react";

type LoginScreenProps = {
  // Should reject (throw) when the email or password is wrong.
  onSubmit: (email: string, password: string) => Promise<void>;
};

type FieldErrors = { email?: string; password?: string };

export function LoginScreen({ onSubmit }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginError(null);

    const next: FieldErrors = {};
    if (!email.trim()) next.email = "Email is required";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Enter a valid email address";
    if (!password) next.password = "Password is required";
    setErrors(next);
    if (next.email || next.password) return;

    setSubmitting(true);
    try {
      await onSubmit(email.trim(), password);
    } catch {
      setLoginError("Incorrect email or password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm space-y-4 p-4">
      <h1 className="text-2xl font-bold">Log in</h1>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {loginError && (
          <p role="alert" className="rounded border border-red-500 p-2 text-sm text-red-700">
            {loginError}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="block font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? "true" : "false"}
            aria-describedby={errors.email ? "email-error" : undefined}
            className="w-full rounded border px-3 py-2"
          />
          {errors.email && (
            <p id="email-error" role="alert" className="text-sm text-red-700">
              {errors.email}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={errors.password ? "true" : "false"}
            aria-describedby={errors.password ? "password-error" : undefined}
            className="w-full rounded border px-3 py-2"
          />
          {errors.password && (
            <p id="password-error" role="alert" className="text-sm text-red-700">
              {errors.password}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-black px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}

export default LoginScreen;