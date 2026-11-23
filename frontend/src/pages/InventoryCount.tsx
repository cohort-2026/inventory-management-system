import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  MapPin,
  Plus,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../utils/AuthContext';
import { listCounts, listCountLocations, startCount } from '../services/stockCountApi';
import type { LocationOption, StockCount, CountStatus } from '../services/stockCountApi';

const FINAL = new Set<CountStatus>(['POSTED', 'completed', 'CANCELLED']);

function displayStatus(value: CountStatus): string {
  switch (value) {
    case 'IN_PROGRESS': return 'In progress';
    case 'SUBMITTED': return 'Awaiting Manager review';
    case 'POSTED': return 'Posted';
    case 'CANCELLED': return 'Cancelled';
    case 'DRAFT': return 'Draft';
    case 'completed': return 'Legacy completed';
    default: return 'Legacy open';
  }
}

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
      const [records, sites] = await Promise.all([listCounts(), listCountLocations()]);
      setCounts(records);
      setLocations(sites);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load stock counts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function create(): Promise<void> {
    if (!canManage || busy || !locationId) return;
    setBusy(true);
    setActionError('');
    try {
      const created = await startCount(locationId);
      navigate(`/counts/${created.count_id}`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Unable to start count.');
    } finally {
      setBusy(false);
    }
  }

  const visibleCounts = useMemo(() => counts, [counts]);
  const completedCount = visibleCounts.filter(record => FINAL.has(record.status)).length;
  const openCount = visibleCounts.filter(record => !FINAL.has(record.status)).length;
  const nameOf = (id: string) =>
    locations.find(location => location.location_id === id)?.name ?? 'Unknown warehouse';

  return (
    <AppLayout>
      <div className="count-workspace">
        <PageHeader
          title="Stock Counts"
          subtitle="Blind physical verification with Manager approval."
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
            <h2>Blind warehouse verification</h2>
            <p>Counters do not see expected quantities. Submission locks entries until Manager review.</p>
          </div>
          <span className="count-hero-pill"><ShieldCheck size={15} aria-hidden="true" /> Audit workflow</span>
        </section>

        <div className="count-metrics" aria-label="Count summary">
          <div className="count-metric count-metric-primary">
            <span className="count-metric-icon"><ClipboardList size={20} aria-hidden="true" /></span>
            <span className="count-metric-label">Visible counts</span>
            <strong className="count-metric-value">{loading ? '—' : visibleCounts.length}</strong>
            <span className="count-metric-caption">Accessible to your role</span>
          </div>
          <div className="count-metric">
            <span className="count-metric-icon"><RefreshCcw size={20} aria-hidden="true" /></span>
            <span className="count-metric-label">Active / awaiting review</span>
            <strong className="count-metric-value">{loading ? '—' : openCount}</strong>
            <span className="count-metric-caption">Not yet posted</span>
          </div>
          <div className="count-metric">
            <span className="count-metric-icon"><CheckCircle2 size={20} aria-hidden="true" /></span>
            <span className="count-metric-label">Closed records</span>
            <strong className="count-metric-value">{loading ? '—' : completedCount}</strong>
            <span className="count-metric-caption">Posted, cancelled or legacy</span>
          </div>
        </div>

        {canManage && (
          <section className="count-panel count-start-panel" aria-labelledby="start-count-label">
            <div className="count-panel-heading">
              <span className="count-section-icon"><Plus size={19} aria-hidden="true" /></span>
              <div>
                <h2 id="start-count-label">Start blind count</h2>
                <p>Every active product is included, even when its system balance is zero.</p>
              </div>
            </div>
            <div className="count-start-controls">
              <div className="field count-location-field">
                <label className="field-label" htmlFor="count-location"><MapPin size={15} aria-hidden="true" /> Warehouse</label>
                <select
                  id="count-location"
                  className="field-select"
                  value={locationId}
                  disabled={loading || busy}
                  onChange={event => setLocationId(event.target.value)}
                >
                  <option value="">Select warehouse</option>
                  {locations.filter(location => location.status === 'active').map(location => (
                    <option key={location.location_id} value={location.location_id}>
                      {location.name} ({location.code})
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-primary" disabled={loading || busy || !locationId} onClick={() => void create()}>
                <Plus size={16} aria-hidden="true" /> {busy ? 'Starting…' : 'Start Count'}
              </button>
            </div>
            {actionError && <p className="count-feedback count-feedback-error" role="alert">{actionError}</p>}
          </section>
        )}

        <section className="count-panel" aria-labelledby="count-history-heading">
          <div className="count-panel-heading">
            <span className="count-section-icon"><ClipboardList size={19} aria-hidden="true" /></span>
            <div>
              <h2 id="count-history-heading">Count history</h2>
              <p>Submitted counts await Manager review; legacy records remain read-only.</p>
            </div>
          </div>
          {loading ? (
            <p role="status" className="count-state">Loading stock counts…</p>
          ) : error ? (
            <div role="alert" className="count-state">
              <p>{error}</p>
              <button className="btn btn-secondary" type="button" onClick={() => void reload()}>Try again</button>
            </div>
          ) : visibleCounts.length === 0 ? (
            <div className="count-empty" role="status">No stock counts available for your role.</div>
          ) : (
            <div className="count-table-scroll">
              <table className="data-table count-table">
                <thead><tr><th>Reference</th><th>Warehouse</th><th>Started</th><th>Status</th><th>Open</th></tr></thead>
                <tbody>
                  {visibleCounts.map(record => (
                    <tr key={record.count_id}>
                      <td className="mono">{record.count_no}</td>
                      <td>{nameOf(record.location_id)}</td>
                      <td>{new Date(record.created_at).toLocaleString()}</td>
                      <td><span className={`count-status ${FINAL.has(record.status) ? 'count-status-completed' : 'count-status-open'}`}>
                        {displayStatus(record.status)}
                      </span></td>
                      <td className="count-row-actions">
                        <Link className="btn btn-secondary btn-sm" to={`/counts/${record.count_id}`}>
                          View <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                        {user?.roleName === 'Manager' && record.status === 'SUBMITTED' && (
                          <Link className="btn btn-primary btn-sm" to={`/counts/${record.count_id}/review`}>
                            Review
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="count-panel-footnote">Viewer accounts see posted and historical completed records only.</p>
        </section>
      </div>
    </AppLayout>
  );
}
