import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  MapPin,
  Search,
  ShieldCheck,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../utils/AuthContext';
import { getCountDetail, listCountLocations, saveCount, submitCount } from '../services/stockCountApi';
import type { CountLine, StockCount, CountStatus } from '../services/stockCountApi';

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const EDITABLE = new Set<CountStatus>(['DRAFT', 'IN_PROGRESS']);

function validQuantity(value: string): boolean {
  return value.length <= 100 && DECIMAL.test(value);
}

export default function InventoryCountDetail() {
  const { countId = '' } = useParams<{ countId: string }>();
  const { user } = useAuth();
  const canCount = user?.roleName === 'Manager' || user?.roleName === 'Inventory Staff';
  const [count, setCount] = useState<StockCount | null>(null);
  const [locationName, setLocationName] = useState('');
  const [lines, setLines] = useState<CountLine[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, locations] = await Promise.all([
        getCountDetail(countId),
        listCountLocations(),
      ]);
      setCount(detail.count);
      setLines(detail.items);
      setDraft(Object.fromEntries(detail.items.map(line => [line.product_id, line.counted_quantity ?? ''])));
      setLocationName(locations.find(location => location.location_id === detail.count.location_id)?.name ?? 'Warehouse');
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load count details.');
    } finally {
      setLoading(false);
    }
  }, [countId]);

  useEffect(() => { void load(); }, [load]);

  const canEdit = canCount && count !== null && EDITABLE.has(count.status);
  const legacy = count?.status === 'open' || count?.status === 'completed';
  const errors = useMemo(() => Object.fromEntries(lines.filter(line => {
    const value = draft[line.product_id] ?? '';
    return value !== '' && !validQuantity(value);
  }).map(line => [line.product_id, 'Enter a non-negative decimal quantity.'])), [lines, draft]);
  const invalid = Object.keys(errors).length > 0;
  const uncounted = lines.filter(line => (draft[line.product_id] ?? '') === '');
  const counted = lines.length - uncounted.length;
  const filtered = lines.filter(line => `${line.product_name ?? ''} ${line.sku ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const unsaved = lines.some(line => (draft[line.product_id] ?? '') !== (line.counted_quantity ?? ''));

  async function save(): Promise<boolean> {
    if (!canEdit || busyRef.current || invalid) {
      if (invalid) setActionError('Correct invalid quantities before saving.');
      return false;
    }
    const items = lines.filter(line => {
      const value = draft[line.product_id] ?? '';
      return value !== '' && value !== (line.counted_quantity ?? '') && (count?.recount_round === 0 || line.recount_required);
    }).map(line => ({ product_id: line.product_id, counted_quantity: draft[line.product_id] }));
    if (!items.length) {
      setNotice('No new quantities to save.');
      return true;
    }
    busyRef.current = true;
    setSaving(true);
    setActionError('');
    try {
      await saveCount(countId, items);
      setLines(previous => previous.map(line => ({
        ...line,
        counted_quantity: items.find(item => item.product_id === line.product_id)?.counted_quantity ?? line.counted_quantity,
      })));
      setNotice('Draft saved. Live inventory has not changed.');
      return true;
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Could not save count.');
      return false;
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  async function submit(): Promise<void> {
    if (!canEdit || busyRef.current || invalid || uncounted.length || lines.length === 0) return;
    if (!window.confirm('Submit this count for Manager review? Entries will become read-only.')) return;
    if (unsaved && !(await save())) return;
    busyRef.current = true;
    setSaving(true);
    setActionError('');
    try {
      await submitCount(countId);
      await load();
      setNotice('Count submitted. No stock changes have been posted.');
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Count submission failed.');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="count-workspace">
        <PageHeader
          breadcrumb="Stock Counts"
          title="Blind Stock Count"
          subtitle={locationName || 'Warehouse verification'}
          actions={<Link className="btn btn-secondary" to="/counts">Back to Counts</Link>}
        />
        {loading ? (
          <p className="count-state" role="status">Loading count…</p>
        ) : error ? (
          <div className="count-state" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>Retry</button>
          </div>
        ) : !count ? (
          <p role="alert">Count not found.</p>
        ) : (
          <>
            <section className="count-hero" aria-label="Count identity">
              <div className="count-hero-icon"><ClipboardCheck size={25} aria-hidden="true" /></div>
              <div className="count-hero-copy">
                <span className="count-eyebrow">{count.count_no}</span>
                <h2>{locationName}</h2>
                <p><MapPin size={14} aria-hidden="true" /> Started {new Date(count.created_at).toLocaleString()}</p>
              </div>
              <span className="count-hero-pill"><ShieldCheck size={15} aria-hidden="true" /> {count.status.replace(/_/g, ' ')}</span>
            </section>
            <div className="count-metrics" aria-label="Count progress">
              <div className="count-metric count-metric-primary">
                <span className="count-metric-icon"><ClipboardList size={20} aria-hidden="true" /></span>
                <span className="count-metric-label">Products in snapshot</span>
                <strong className="count-metric-value">{lines.length}</strong>
              </div>
              <div className="count-metric">
                <span className="count-metric-icon"><CheckCircle2 size={20} aria-hidden="true" /></span>
                <span className="count-metric-label">Counted products</span>
                <strong className="count-metric-value">{counted}</strong>
              </div>
              <div className="count-metric">
                <span className="count-metric-icon"><ShieldCheck size={20} aria-hidden="true" /></span>
                <span className="count-metric-label">Pending entries</span>
                <strong className="count-metric-value">{uncounted.length}</strong>
              </div>
            </div>
            <progress
              className="count-progress-track"
              value={counted}
              max={Math.max(lines.length, 1)}
              aria-label="Counting progress"
            />
            <p className="count-explanation">
              Blind count: expected quantities and differences are intentionally unavailable here.
              Saving or submitting does not alter live stock.
            </p>
            {legacy && <p className="count-feedback" role="status">Legacy count. Editing is disabled during F08 migration.</p>}
            {count.status === 'SUBMITTED' && <p className="count-feedback" role="status">Submitted for Manager approval. Entries are locked.</p>}
            {(count.status === 'SUBMITTED' || count.status === 'POSTED') && user?.roleName === 'Manager' && (
              <p className="count-review-link"><Link className="btn btn-primary" to={`/counts/${encodeURIComponent(countId)}/review`}>{count.status === 'POSTED' ? 'View posted review' : 'Open Manager review'}</Link></p>
            )}
            {notice && <p className="count-feedback count-feedback-success" role="status">{notice}</p>}
            {actionError && <p className="count-feedback count-feedback-error" role="alert">{actionError}</p>}

            <section className="count-panel" aria-labelledby="count-lines-title">
              <div className="count-panel-heading">
                <span className="count-section-icon"><ClipboardList size={19} aria-hidden="true" /></span>
                <div>
                  <h2 id="count-lines-title">Physical quantities</h2>
                  <p>Enter the amount found for each product. Zero is a valid physical count.</p>
                </div>
              </div>
              <div className="count-search-field">
                <label className="field-label" htmlFor="count-search"><Search size={15} aria-hidden="true" /> Search product</label>
                <input id="count-search" className="field-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or SKU…" />
              </div>
              {lines.length === 0 ? (
                <div className="count-empty" role="status">This count contains no products.</div>
              ) : filtered.length === 0 ? (
                <div className="count-empty" role="status">No products match your search.</div>
              ) : (
                <div className="count-table-scroll">
                  <table className="data-table count-table">
                    <thead><tr><th>Product</th><th>SKU</th><th>Counted quantity</th><th>Entry state</th></tr></thead>
                    <tbody>
                      {filtered.map(line => {
                        const value = draft[line.product_id] ?? '';
                        const rowEditable = canEdit && (count.recount_round === 0 || line.recount_required);
                        const inputId = `count-${line.product_id}`;
                        return (
                          <tr key={line.product_id}>
                            <td className="count-product-name">{line.product_name || 'Unnamed product'}</td>
                            <td className="mono">{line.sku}</td>
                            <td>
                              <label htmlFor={inputId} className="count-input-label">Physical count for {line.product_name || line.sku}</label>
                              {rowEditable ? (
                                <input
                                  id={inputId}
                                  className="field-input count-quantity-input"
                                  type="text"
                                  inputMode="decimal"
                                  disabled={saving}
                                  value={value}
                                  aria-invalid={Boolean(errors[line.product_id])}
                                  onChange={event => {
                                    setDraft(previous => ({ ...previous, [line.product_id]: event.target.value }));
                                    setNotice('');
                                  }}
                                />
                              ) : <span className="mono" id={inputId}>{value || 'Not counted'}</span>}
                              {errors[line.product_id] && <p className="field-error" role="alert">{errors[line.product_id]}</p>}
                            </td>
                            <td>{value === '' ? 'Pending' : 'Recorded'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {canEdit && (
                <div className="count-footer-actions">
                  <button className="btn btn-secondary" type="button" disabled={saving || invalid || !unsaved} onClick={() => void save()}>
                    {saving ? 'Saving…' : 'Save Progress'}
                  </button>
                  <button className="btn btn-primary" type="button" disabled={saving || invalid || !!uncounted.length || lines.length === 0} onClick={() => void submit()}>
                    Submit for Manager review
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
