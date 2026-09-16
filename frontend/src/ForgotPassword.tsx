import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./utils/AuthContext";
import "./ForgotPassword.tsx";

const ForgotPassword: React.FC = () => {
  const { forgotPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);

      await forgotPassword(email, window.location.origin);

      setMessage(
        "Password reset email sent. Please check your inbox."
      );

      setEmail("");
    } catch (err) {
      setError(
        "Unable to send reset email. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-password-page">
      <div className="forgot-password-card">

        <h1>Forgot Password?</h1>

        <p className="description">
          Enter your email address below and we will send you
          a link to reset your password.
        </p>

        <form
          className="forgot-password-form"
          onSubmit={handleSubmit}
        >
          <label htmlFor="email">
            Email Address
          </label>

          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Email"}
          </button>
        </form>

        {message && (
          <div className="success-message">
            {message}
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <Link
          to="/login"
          className="back-to-login"
        >
          ← Back to Login
        </Link>

      </div>
    </div>
  );
};

export default ForgotPassword;