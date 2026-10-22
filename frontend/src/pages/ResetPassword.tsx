import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button";
import Field from "../components/Field";

const API_URL = `${import.meta.env.VITE_API_URL}/api/auth`;

export default function ResetPassword() {
  const [accessToken, setAccessToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("access_token");
    const type = fragment.get("type");
    const providerError = fragment.get("error_description");

    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    if (providerError) {
      setError(providerError);
      return;
    }
    if (type !== "recovery" || !token) {
      setError("This password reset link is invalid or expired. Request a new one.");
      return;
    }

    setAccessToken(token);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!accessToken) {
      setError("This password reset link is invalid or expired. Request a new one.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not update the password.");
      }

      setAccessToken("");
      setPassword("");
      setConfirmPassword("");
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update the password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark" />
          <h1>Inventory Management System</h1>
        </div>
        <p className="auth-subtitle">Choose a new password</p>

        {message ? (
          <>
            <p role="status">{message}</p>
            <Link to="/login" className="auth-link">Sign in</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Field
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            {error && <p className="field-error" role="alert">{error}</p>}
            <Button type="submit" className="auth-submit" disabled={submitting || !accessToken}>
              {submitting ? "Updating..." : "Update password"}
            </Button>
            <Link to="/forgot-password" className="auth-link">Request another reset link</Link>
          </form>
        )}
      </div>
    </div>
  );
}
