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
  const [showPassword, setShowPassword] = useState(false);

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
    <main className="min-h-screen flex items-center justify-center bg-[#eeeeee] px-4">
      <div className="w-full max-w-[460px] rounded-[12px] border border-zinc-500 bg-white px-10 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="flex items-center justify-center gap-2 text-[20px] font-bold tracking-wide text-black">
            <span className="h-[12px] w-[12px] bg-black inline-block"></span>
            INVENTORY APP
          </h1>
          <p className="mt-3 text-[14px] text-zinc-400">Welcome back</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[14px] font-bold text-black">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              aria-invalid={errors.email ? "true" : "false"}
              aria-describedby={errors.email ? "email-error" : undefined}
              className="w-full rounded-[6px] border border-zinc-500 px-3 py-[10px] text-[14px] text-black placeholder:text-zinc-400 outline-none focus:border-black"
            />
            {errors.email && (
              <p id="email-error" role="alert" className="text-xs text-red-600">
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-[14px] font-bold text-black">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                aria-invalid={errors.password ? "true" : "false"}
                aria-describedby={errors.password ? "password-error" : undefined}
                className="w-full rounded-[6px] border border-zinc-500 px-3 py-[10px] pr-10 text-[14px] text-black placeholder:text-zinc-400 outline-none focus:border-black"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <span className="block h-4 w-4 rounded-full border border-zinc-400"></span>
              </button>
            </div>
            {errors.password && (
              <p id="password-error" role="alert" className="text-xs text-red-600">
                {errors.password}
              </p>
            )}
          </div>

          {/* Remember me */}
          <div className="flex items-center gap-2 pt-1">
            <input
              id="remember"
              type="checkbox"
              defaultChecked
              className="h-[18px] w-[18px] rounded-[3px] border-zinc-500 accent-black"
            />
            <label htmlFor="remember" className="text-[14px] text-zinc-600">
              Remember me
            </label>
          </div>

          {/* Sign In */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-[6px] bg-[#0f6d8f] py-[11px] text-[15px] font-semibold text-white hover:bg-[#0d5d7a] disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>

          {/* Forgot */}
          <div className="text-center">
            <button type="button" className="text-[14px] font-bold text-[#0f6d8f] hover:underline">
              Forgot password?
            </button>
          </div>

          {/* Error area */}
          <div className="border-t border-zinc-200 pt-5 mt-6">
            {loginError ? (
              <p role="alert" className="flex gap-1 text-[12px] text-red-600">
                <span>⚠</span> {loginError}
              </p>
            ) : (
              <p className="flex gap-1 text-[12px] text-zinc-400">
                <span>⚠</span> Authentication error appears here
              </p>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

export default LoginScreen;