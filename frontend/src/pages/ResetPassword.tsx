import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { resetPassword } from "../api/passwordReset";

// Supabase puts the reset token after the "#" in the link from the email.
function readResetToken(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get("error") || params.get("error_code")) return null; // expired or invalid link
  if (params.get("type") !== "recovery") return null;
  return params.get("access_token");
}

type FieldErrors = { password?: string; confirm?: string };

export function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token] = useState(readResetToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Remove the token from the address bar so it isn't left in the browser history.
  useEffect(() => {
    navigate(location.pathname, { replace: true });
  }, [navigate, location.pathname]);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    setSubmitError(null);

    const next: FieldErrors = {};
    if (password.length < 8) next.password = "Password must be at least 8 characters";
    if (confirm !== password) next.confirm = "Passwords do not match";
    setErrors(next);
    if (next.password || next.confirm) return;

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      navigate("/login", { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-sm space-y-4 p-4">
        <h1 className="text-2xl font-bold">Reset link not valid</h1>
        <p role="alert">This reset link is invalid or has expired.</p>
        <Link to="/forgot-password" className="underline">
          Request a new link
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm space-y-4 p-4">
      <h1 className="text-2xl font-bold">Choose a new password</h1>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {submitError && (
          <p role="alert" className="rounded border border-red-500 p-2 text-sm text-red-700">
            {submitError}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="new-password" className="block font-medium">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={errors.password ? "true" : "false"}
            aria-describedby={errors.password ? "new-password-error" : undefined}
            className="w-full rounded border px-3 py-2"
          />
          {errors.password && (
            <p id="new-password-error" role="alert" className="text-sm text-red-700">
              {errors.password}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="confirm-password" className="block font-medium">
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={errors.confirm ? "true" : "false"}
            aria-describedby={errors.confirm ? "confirm-password-error" : undefined}
            className="w-full rounded border px-3 py-2"
          />
          {errors.confirm && (
            <p id="confirm-password-error" role="alert" className="text-sm text-red-700">
              {errors.confirm}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-black px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </main>
  );
}