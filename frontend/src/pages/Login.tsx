import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import Field from "../components/Field";
import Button from "../components/Button";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark" />
            <h1>Inventory Management System</h1>
        </div>

      <p className="auth-subtitle">Welcome back</p>

      <form onSubmit={handleSubmit}>
        
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="field-error">{error}</p>}

        <Button type="submit" className="auth-submit">Sign In</Button>
      </form>

      <Link to="/forgot-password" className="auth-link">Forgot Password?</Link>
      <Link to="/register" className="auth-link">Don't have an account? Sign Up</Link>
    </div>
    </div>
  );
}