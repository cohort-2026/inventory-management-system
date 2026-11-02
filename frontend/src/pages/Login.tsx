import { useState } from "react";
<<<<<<< HEAD
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../utils/AuthContext";
import Field from "../components/Field";
import Button from "../components/Button";
=======
import type { FormEvent } from "react";
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from "lucide-react";
>>>>>>> testing

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
<<<<<<< HEAD
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    console.log("Submitting login form");
=======
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const toggleVisibility = () => {
    setShowPassword((prev) => !prev);
  };
>>>>>>> testing

    e.preventDefault();
    setError("");

    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      setError("Login failed");
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth=brand-mark" />
            <h1>Inventory Management System</h1>
        </div>

      <p className="auth-subtitle">Welcome back</p>

<<<<<<< HEAD
      <form onSubmit={handleSubmit}>
        
        <Field
          label="Username"
          type="text"
          placeholder="admin"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
=======
          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="password" style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#000", marginBottom: "4px" }}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                style={{ width: "100%", height: "34px", border: "1.5px solid #111", borderRadius: "4px", padding: "0 32px 0 10px", fontSize: "12px", outline: "none", boxSizing: "border-box" }}
              />
              <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)"}}>
              <button
                type="button"
                onClick={toggleVisibility}
                className="absolute right-3 text-gray-500 hover:text-gray-700 focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}  
              </button>

              </span>
            </div>
            {errors.password && <p style={{ marginTop: "4px", fontSize: "10px", color: "#d00" }}>{errors.password}</p>}
          </div>
>>>>>>> testing

        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="field-error">{error}</p>}

<<<<<<< HEAD
        <Button type="submit" className="auth-submit">Sign In</Button>
      </form>
=======
          <div style={{ textAlign: "center", marginTop: "10px" }}>
            <Link
              to="/forgot-password"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#3566a3',
                textDecoration: 'none',
              }}
            >
              Forgot password?
            </Link>
          </div>
>>>>>>> testing

      <Link to="/forgot-password" className="auth-link">Forgot Password?</Link>
    </div>
    </div>
  );
}