const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api/supabase-auth`;

export type SessionUser = { id: string; email: string; roleId: string; status: string };
export type RoleName = 'Viewer' | 'Inventory Staff' | 'Manager';
export type RoleResponse = { user: SessionUser; role: RoleName };
export type ProbeId = 'viewer' | 'staff' | 'manager';
export type ProbeResult = { id: ProbeId; status: number | null; message: string; allowed: boolean; error?: string };

async function request(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', cache: 'no-store' });
  const body: unknown = await response.json().catch(() => ({}));
  return { status: response.status, body: body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {} };
}

export async function getSessionUser(): Promise<SessionUser> {
  const { status, body } = await request('/me');
  if (status !== 200 || !body.user || typeof body.user !== 'object') throw new Error(`Session check failed (HTTP ${status})`);
  return body.user as SessionUser;
}

export async function getRoleInfo(): Promise<RoleResponse> {
  const { status, body } = await request('/rbac-test/whoami');
  if (status !== 200 || !body.user || typeof body.role !== 'string') throw new Error(`Role lookup failed (HTTP ${status}). Confirm development RBAC routes are enabled.`);
  return { user: body.user as SessionUser, role: body.role as RoleName };
}

export async function checkPermission(id: ProbeId): Promise<ProbeResult> {
  try {
    const { status, body } = await request(`/rbac-test/${id}`);
    const allowed = status === 200;
    const message = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : `HTTP ${status}`;
    return { id, status, allowed, message, error: status >= 500 ? message : undefined };
  } catch (err) {
    return { id, status: null, allowed: false, message: 'Request failed', error: err instanceof Error ? err.message : 'Network error' };
  }
}
