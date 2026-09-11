import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import Field from "../components/Field";
import Button from "../components/Button";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await register(username, password);
      navigate("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark" />
          <h1>Inventory App</h1>
        </div>
        <p className="auth-subtitle">Create an account</p>

        <form onSubmit={handleSubmit}>
          <Field
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            hint="At least 8 characters."
            required
          />

          {error && <p className="field-error">{error}</p>}

          <Button type="submit" className="auth-submit">Create account</Button>
        </form>

        <Link to="/login" className="auth-link">Already have an account? Log in</Link>
      </div>
    </div>
  );
}