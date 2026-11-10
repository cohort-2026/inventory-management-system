import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import { checkPermission, getRoleInfo } from '../services/showcaseApi';
import type { ProbeId, ProbeResult, RoleResponse } from '../services/showcaseApi';
import '../showcase.css';

const targets: { id: ProbeId; label: string; requirement: string }[] = [
  { id: 'viewer', label: 'Viewer access', requirement: 'Viewer, Inventory Staff, Manager' },
  { id: 'staff', label: 'Inventory Staff access', requirement: 'Inventory Staff, Manager' },
  { id: 'manager', label: 'Manager access', requirement: 'Manager only' },
];

export default function RbacShowcase() {
  const [identity, setIdentity] = useState<RoleResponse | null>(null);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const role = await getRoleInfo();
      setIdentity(role);
      setResults(await Promise.all(targets.map((t) => checkPermission(t.id))));
    } catch (err) {
      setIdentity(null);
      setError(err instanceof Error ? err.message : 'Could not resolve user role');
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void run(); }, [run]);

  return (
    <AppLayout>
      <PageHeader title="Role Permissions Demonstration" subtitle="Backend-enforced RBAC · Live HTTP responses" actions={<button className="btn btn-secondary" disabled={busy} onClick={() => void run()}>{busy ? 'Checking…' : 'Run permission checks'}</button>} />
      <div className="showcase-tabs"><Link className="showcase-tab" to="/auth-showcase">← Authentication</Link><Link className="showcase-tab active" to="/rbac-showcase">Role permissions</Link></div>
      <Card title="Authenticated identity">
        <div className="showcase-identity"><span className="showcase-pill showcase-pill-info">{identity?.role ?? (busy ? 'Checking role…' : 'Role unavailable')}</span><span>{identity?.user.email ?? 'No verified identity'}</span></div>
        <p className="showcase-note">The role comes from public.roles through the Express backend, not from a selectable frontend setting.</p>
      </Card>
      <div className="showcase-probes">
        {targets.map((target) => {
          const result = results.find((r) => r.id === target.id);
          return <div className="showcase-probe" key={target.id}>
            <div className="showcase-probe-title">{target.label}</div>
            <div className="showcase-probe-requirement">Allowed roles: {target.requirement}</div>
            <div className="showcase-probe-status">{busy ? <span className="showcase-pill">Checking…</span> : result ? <span className={`showcase-pill ${result.allowed ? 'showcase-pill-ok' : result.status === 403 ? 'showcase-pill-denied' : 'showcase-pill-warn'}`}>{result.status === null ? 'Network error' : `HTTP ${result.status}`} · {result.allowed ? 'Allowed' : result.status === 403 ? 'Denied' : 'Error'}</span> : <span className="showcase-pill">Not checked</span>}</div>
            <p className="showcase-note">{result?.message ?? 'Waiting for backend response'}</p>
          </div>;
        })}
      </div>
      {error && <div className="showcase-error" role="alert">{error}</div>}
      <div className="showcase-footer"><p className="showcase-note">HTTP 200 means permitted; HTTP 403 means authenticated but forbidden. HTTP 401 indicates missing or invalid authentication. Other statuses indicate an error, not an RBAC denial.</p></div>
    </AppLayout>
  );
}