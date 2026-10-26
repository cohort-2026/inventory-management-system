import { useState } from "react";
import type { FormEvent } from "react";


type LoginScreenProps = {
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
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: "380px", border: "1.5px solid #111", borderRadius: "10px", background: "#fff", padding: "28px 28px 22px 28px" }}>
        
        <div style={{ textAlign: "center", marginBottom: "22px" }}>
          <h1 style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "0.3px", color: "#222", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", margin: 0 }}>
            <span style={{ width: "9px", height: "9px", background: "#222", display: "inline-block" }}></span>
            INVENTORY APP
          </h1>
          <p style={{ marginTop: "6px", fontSize: "13px", color: "#9a9a9a", margin: "6px 0 0 0" }}>Welcome back</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="email" style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#000", marginBottom: "4px" }}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              style={{ width: "100%", height: "34px", border: "1.5px solid #111", borderRadius: "4px", padding: "0 10px", fontSize: "12px", fontStyle: "italic", color: "#000", outline: "none", boxSizing: "border-box" }}
            />
            {errors.email && <p style={{ marginTop: "4px", fontSize: "10px", color: "#d00" }}>{errors.email}</p>}
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="password" style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#000", marginBottom: "4px" }}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                style={{ width: "100%", height: "34px", border: "1.5px solid #111", borderRadius: "4px", padding: "0 32px 0 10px", fontSize: "12px", outline: "none", boxSizing: "border-box" }}
              />
              <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", width: "14px", height: "14px", borderRadius: "50%", border: "1px solid #333" }}></span>
            </div>
            {errors.password && <p style={{ marginTop: "4px", fontSize: "10px", color: "#d00" }}>{errors.password}</p>}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "14px 0" }}>
            <input id="remember" type="checkbox" defaultChecked style={{ width: "14px", height: "14px", accentColor: "#000" }} />
            <label htmlFor="remember" style={{ fontSize: "11px", color: "#000" }}>Remember me</label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{ width: "100%", height: "38px", borderRadius: "5px", border: "none", background: "#3566a3", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>

          <div style={{ textAlign: "center", marginTop: "10px" }}>
            <a href="/forgot-password.html" style={{ fontSize: "11px", fontWeight: 700, color: "#3566a3", textDecoration: "none" }}>Forgot password?</a>
          </div>

          <div style={{ marginTop: "16px", borderTop: "1px solid #e6e6e6", paddingTop: "10px" }}>
            {loginError ? (
              <p style={{ fontSize: "10px", color: "#d00" }}>⚠ {loginError}</p>
            ) : (
              <p style={{ fontSize: "10px", fontStyle: "italic", color: "#999" }}>⚠ Authentication error appears here</p>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

export default LoginScreen;