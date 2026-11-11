import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../utils/AuthContext';
import { listCounts, listCountLocations, startCount } from '../services/stockCountApi';
import type { StockCount, LocationOption } from '../services/stockCountApi';

export default function InventoryCount() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.roleName === 'Manager' || user?.roleName === 'Inventory Staff';
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [records, locs] = await Promise.all([listCounts(), listCountLocations()]);
      setCounts(records);
      setLocations(locs);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load stock counts.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);

  async function create() {
    if (!canManage || busy || !locationId) return;
    setBusy(true); setActionError('');
    try { const created = await startCount(locationId); navigate(`/inventory_count/${created.count_id}`); }
    catch (e) { setActionError(e instanceof Error ? e.message : 'Unable to start count.'); }
    finally { setBusy(false); }
  }
  const nameOf = (id: string) => locations.find(x => x.location_id === id)?.name ?? id;
  return (
    <AppLayout>
      <PageHeader title="Stock Counts" subtitle="Review counts and reconcile warehouse stock." actions={<button type="button" className="btn btn-secondary" disabled={loading || busy} onClick={() => void reload()}>Refresh</button>} />
      {canManage && <section className="card" style={{padding:'var(--space-4)', marginBottom:'var(--space-4)'}} aria-labelledby="start-count-label">
        <h2 id="start-count-label" style={{fontSize:'var(--text-lg)', marginBottom:'var(--space-3)'}}>Start a new stock count</h2>
        <div className="field" style={{maxWidth:440}}>
          <label className="field-label" htmlFor="count-location">Location</label>
          <select className="field-select" id="count-location" value={locationId} onChange={e => setLocationId(e.target.value)} disabled={loading || busy} aria-describedby="location-count-hint" aria-invalid={Boolean(actionError)}>
            <option value="">Select a location</option>
            {locations.filter(x => x.status === 'active').map(x => <option key={x.location_id} value={x.location_id}>{x.name} ({x.code})</option>)}
          </select>
          <p className="field-hint" id="location-count-hint">Only active locations can be selected here.</p>
        </div>
        {actionError && <p role="alert" className="field-error">{actionError}</p>}
        <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={loading || busy || !locationId}>{busy ? 'Starting…' : 'Start Count'}</button>
      </section>}
      {loading ? <p role="status">Loading stock counts…</p> : error ? <div role="alert"><p className="field-error">{error}</p><button type="button" className="btn btn-secondary" onClick={() => void reload()}>Try again</button></div> : counts.length === 0 ? <p className="table-empty">No stock counts have been recorded yet.</p> : (
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Location</th><th>Started</th><th>Status</th><th>Started by (user ID)</th><th>Open</th></tr></thead><tbody>
          {counts.filter(x => canManage || x.status === 'completed').map(x => <tr key={x.count_id}>
            <td>{nameOf(x.location_id)}</td><td>{new Date(x.created_at).toLocaleString()}</td><td>{x.status === 'completed' ? 'Completed' : 'In progress'}</td><td className="mono">{x.user_id}</td><td><Link to={`/inventory_count/${x.count_id}`} className="btn btn-secondary btn-sm">View</Link></td>
          </tr>)}</tbody></table></div>
      )}
      {!loading && !error && !canManage && counts.length > 0 && !counts.some(x => x.status === 'completed') && <p className="table-empty">No completed counts are available to view.</p>}
      <p className="table-note">Only completed counts are available to Viewer accounts.</p>
    </AppLayout>
  );
}
