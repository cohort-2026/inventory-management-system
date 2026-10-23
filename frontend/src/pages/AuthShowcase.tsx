import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import { getRoleInfo, getSessionUser } from '../services/showcaseApi';
import type { RoleResponse, SessionUser } from '../services/showcaseApi';
import '../showcase.css';

export default function AuthShowcase() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [info, setInfo] = useState<RoleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const current = await getSessionUser();
      setSession(current);
      try { setInfo(await getRoleInfo()); }
      catch (err) { setInfo(null); setError(err instanceof Error ? err.message : 'Role lookup failed'); }
    } catch (err) {
      setSession(null);
      setInfo(null);
      setError(err instanceof Error ? err.message : 'Session verification failed');
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <AppLayout>
      <PageHeader title="Authentication Overview" subtitle="Live session verification through Express and Supabase Auth" actions={<button className="btn btn-secondary" disabled={busy} onClick={() => void refresh()}>Refresh verification</button>} />
      <div className="showcase-tabs"><Link className="showcase-tab active" to="/auth-showcase">Authentication</Link><Link className="showcase-tab" to="/rbac-showcase">Role permissions →</Link></div>
      <div className="showcase-grid">
        <Card title="Current session">
          <div className="showcase-state"><span className={`showcase-pill ${session ? 'showcase-pill-ok' : 'showcase-pill-warn'}`}>{busy ? 'Verifying…' : session ? 'Authenticated · 200' : 'Not verified'}</span></div>
          <dl className="showcase-details"><div><dt>Email</dt><dd>{session?.email ?? '—'}</dd></div><div><dt>Account status</dt><dd>{session?.status ?? '—'}</dd></div><div><dt>Application role</dt><dd>{info?.role ?? 'Not resolved'}</dd></div><div><dt>User ID</dt><dd className="mono showcase-break">{session?.id ?? '—'}</dd></div></dl>
        </Card>
        <Card title="How authentication works">
          <div className="showcase-flow"><div>1. Login form submits credentials to Express</div><div>2. Supabase Auth verifies credentials</div><div>3. Express establishes HTTP-only session cookies</div><div>4. GET /me validates session and active user profile</div></div>
          <p className="showcase-note">This information is fetched live from the backend. No authentication result is hardcoded.</p>
        </Card>
      </div>
      {error && <div className="showcase-error" role="alert">{error}</div>}
      <div className="showcase-footer"><Link className="btn btn-primary" to="/rbac-showcase">Open RBAC demonstration →</Link></div>
    </AppLayout>
  );
}
