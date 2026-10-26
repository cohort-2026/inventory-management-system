// Use the same backend address your login call uses.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
// Use the real mount path from backend/src/index.ts (search for app.use).
const AUTH_URL = `${API_URL}/api/auth`;

async function post(path: string, body: unknown): Promise<{ message?: string }> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  const data: { error?: unknown; message?: string } = await res.json().catch(() => ({}));

  if (!res.ok) {
    // The backend sends { error: "..." } with messages that are safe to show.
    throw new Error(
      typeof data.error === "string" ? data.error : "Something went wrong. Please try again."
    );
  }
  return data;
}

export function requestPasswordReset(email: string) {
  return post("/forgot-password", { email });
}

export function resetPassword(accessToken: string, newPassword: string) {
  return post("/reset-password", { accessToken, newPassword });
}