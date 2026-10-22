import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button";
import Field from "../components/Field";

const API_URL = `${import.meta.env.VITE_API_URL}/api/auth`;

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not request a password reset.");
      }
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not request a password reset.");
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
        <p className="auth-subtitle">Reset your password</p>
        <p>Enter the email address associated with your account. If it exists, we’ll send a reset link.</p>

        <form onSubmit={handleSubmit}>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {message && <p role="status">{message}</p>}
          {error && <p className="field-error" role="alert">{error}</p>}
          <Button type="submit" className="auth-submit" disabled={submitting}>
            {submitting ? "Sending..." : "Send reset link"}
          </Button>
        </form>

        <Link to="/login" className="auth-link">Back to sign in</Link>
      </div>
    </div>
  );
}
