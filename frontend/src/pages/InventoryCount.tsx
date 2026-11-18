import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, ClipboardCheck, ClipboardList,
  MapPin, Plus, RefreshCcw, ShieldCheck,
} from 'lucide-react';
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load stock counts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  async function create() {
    if (!canManage || busy || !locationId) return;
    setBusy(true);
    setActionError('');
    try {
      const created = await startCount(locationId);
      navigate(`/inventory_count/${created.count_id}`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Unable to start count.');
    } finally {
      setBusy(false);
    }
  }

  const visibleCounts = useMemo(
    () => counts.filter((record) => canManage || record.status === 'completed'),
    [counts, canManage],
  );
  const completedCount = visibleCounts.filter((record) => record.status === 'completed').length;
  const openCount = visibleCounts.length - completedCount;
  const nameOf = (id: string) => locations.find((location) => location.location_id === id)?.name ?? 'Unknown location';

  return (
    <AppLayout>
      <div className="count-workspace">
        <PageHeader
          title="Stock Counts"
          subtitle="Verify physical stock and track warehouse reconciliation."
          actions={
            <button type="button" className="btn btn-secondary" disabled={loading || busy} onClick={() => void reload()}>
              <RefreshCcw size={16} aria-hidden="true" /> Refresh
            </button>
          }
        />

        <section className="count-hero" aria-label="Stock count overview">
          <div className="count-hero-icon"><ClipboardCheck size={25} aria-hidden="true" /></div>
          <div className="count-hero-copy">
            <span className="count-eyebrow">INVENTORY CONTROL</span>
            <h2>Physical stock verification</h2>
            <p>Start a count, record actual quantities and review variances before stock reconciliation.</p>
          </div>
          <span className="count-hero-pill"><ShieldCheck size={15} aria-hidden="true" /> Auditable workflow</span>
        </section>

        <div className="count-metrics" aria-label="Count summary">
          <div className="count-metric count-metric-primary">
            <span className="count-metric-icon"><ClipboardList size={20} aria-hidden="true" /></span>
            <span className="count-metric-label">Visible counts</span>
            <strong className="count-metric-value">{loading ? '—' : visibleCounts.length}</strong>
            <span className="count-metric-caption">Count records available to your role</span>
          </div>
          <div className="count-metric">
            <span className="count-metric-icon"><RefreshCcw size={20} aria-hidden="true" /></span>
            <span className="count-metric-label">In progress</span>
            <strong className="count-metric-value">{loading ? '—' : openCount}</strong>
            <span className="count-metric-caption">Awaiting completion</span>
          </div>
          <div className="count-metric">
            <span className="count-metric-icon"><CheckCircle2 size={20} aria-hidden="true" /></span>
            <span className="count-metric-label">Completed</span>
            <strong className="count-metric-value">{loading ? '—' : completedCount}</strong>
            <span className="count-metric-caption">Read-only audit records</span>
          </div>
        </div>

        {canManage && (
          <section className="count-panel count-start-panel" aria-labelledby="start-count-label">
            <div className="count-panel-heading">
              <span className="count-section-icon"><Plus size={19} aria-hidden="true" /></span>
              <div>
                <h2 id="start-count-label">Start a stock count</h2>
                <p>Select the active warehouse whose stock you want to verify.</p>
              </div>
            </div>
            <div className="count-start-controls">
              <div className="field count-location-field">
                <label className="field-label" htmlFor="count-location"><MapPin size={15} aria-hidden="true" /> Location</label>
                <select
                  className="field-select"
                  id="count-location"
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                  disabled={loading || busy}
                  aria-describedby="location-count-hint"
                  aria-invalid={Boolean(actionError)}
                >
                  <option value="">Select a location</option>
                  {locations.filter((location) => location.status === 'active').map((location) => (
                    <option key={location.location_id} value={location.location_id}>
                      {location.name} ({location.code})
                    </option>
                  ))}
                </select>
                <p className="field-hint" id="location-count-hint">Only active locations can be selected.</p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={loading || busy || !locationId}>
                <Plus size={16} aria-hidden="true" /> {busy ? 'Starting…' : 'Start Count'}
              </button>
            </div>
            {actionError && <p role="alert" className="count-feedback count-feedback-error">{actionError}</p>}
          </section>
        )}

        <section className="count-panel" aria-labelledby="count-history-heading">
          <div className="count-panel-heading count-panel-heading-split">
            <div className="count-heading-group">
              <span className="count-section-icon"><ClipboardList size={19} aria-hidden="true" /></span>
              <div>
                <h2 id="count-history-heading">Count history</h2>
                <p>Open a count to view its captured quantities and status.</p>
              </div>
            </div>
            {!loading && !error && <span className="count-record-total">{visibleCounts.length} records</span>}
          </div>
          {loading ? (
            <p className="count-state" role="status">Loading stock counts…</p>
          ) : error ? (
            <div className="count-state" role="alert">
              <p>{error}</p>
              <button type="button" className="btn btn-secondary" onClick={() => void reload()}>Try again</button>
            </div>
          ) : visibleCounts.length === 0 ? (
            <div className="count-empty" role="status">
              <ClipboardCheck size={29} aria-hidden="true" />
              <strong>No stock counts available</strong>
              <p>{canManage ? 'Start a count at an active location to begin.' : 'Completed counts will appear here when available.'}</p>
            </div>
          ) : (
            <div className="count-table-scroll">
              <table className="data-table count-table">
                <thead><tr><th>Location</th><th>Started</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                  {visibleCounts.map((record) => (
                    <tr key={record.count_id}>
                      <td><span className="count-location-name"><MapPin size={15} aria-hidden="true" />{nameOf(record.location_id)}</span></td>
                      <td className="count-date">{new Date(record.created_at).toLocaleString()}</td>
                      <td><span className={`count-status ${record.status === 'completed' ? 'count-status-completed' : 'count-status-open'}`}>
                        {record.status === 'completed' ? 'Completed' : 'In progress'}
                      </span></td>
                      <td><Link to={`/inventory_count/${record.count_id}`} className="btn btn-secondary btn-sm">
                        View Count <ArrowRight size={14} aria-hidden="true" />
                      </Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="count-panel-footnote">Viewer accounts can access completed counts only.</p>
        </section>
      </div>
    </AppLayout>
  );
}
