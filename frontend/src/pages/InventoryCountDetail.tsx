import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck,
  ClipboardList, MapPin, RefreshCcw, Search, ShieldCheck,
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../utils/AuthContext';
import { finalizeCount, getCountDetail, listCountLocations, saveCount } from '../services/stockCountApi';
import type { CountLine, StockCount } from '../services/stockCountApi';

const FINALIZE_ENABLED = import.meta.env.VITE_ENABLE_STOCK_COUNT_FINALIZE === 'true';
const NONNEGATIVE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function validQuantity(value: string): boolean {
  return value.length <= 100 && NONNEGATIVE.test(value);
}

function variance(counted: string | null, expected: string): string | null {
  if (counted === null || !validQuantity(counted)) return null;
  // UI preview only; the backend remains authoritative for NUMERIC arithmetic.
  const difference = Number(counted) - Number(expected);
  return Number.isFinite(difference)
    ? String(Number(difference.toPrecision(12)))
    : null;
}

export default function InventoryCountDetail() {
  const { countId = '' } = useParams<{ countId: string }>();
  const { user } = useAuth();
  const allowedToEdit = user?.roleName === 'Manager' || user?.roleName === 'Inventory Staff';

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
  const [review, setReview] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, locations] = await Promise.all([
        getCountDetail(countId),
        listCountLocations(),
      ]);
      const { count: record, items } = detail;
      setCount(record);
      setLines(items);
      setLocationName(
        locations.find((location) => location.location_id === record.location_id)?.name ??
          'Unknown location',
      );
      setDraft(Object.fromEntries(items.map((item) => [item.product_id, item.counted_quantity ?? ''])));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load count details.');
    } finally {
      setLoading(false);
    }
  }, [countId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const complete = count?.status === 'completed';
  const canEdit = allowedToEdit && count?.status === 'open';
  const errors = useMemo(
    () => Object.fromEntries(
      lines
        .filter((line) => {
          const input = draft[line.product_id] ?? '';
          return input !== '' && !validQuantity(input);
        })
        .map((line) => [line.product_id, 'Enter a non-negative decimal quantity.']),
    ),
    [draft, lines],
  );
  const hasInvalid = Object.keys(errors).length > 0;
  const uncounted = lines.filter((line) => (draft[line.product_id] ?? '') === '');
  const differences = lines.filter((line) => {
    const value = draft[line.product_id] ?? '';
    return value !== '' && !errors[line.product_id] && variance(value, line.expected_quantity) !== '0';
  });
  const shown = lines.filter((line) =>
    `${line.product_name ?? ''} ${line.product_id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const countedCount = lines.length - uncounted.length;
  const completionPercentage = lines.length ? (countedCount / lines.length) * 100 : 0;

  async function save(): Promise<boolean> {
    if (!canEdit || busyRef.current || hasInvalid) {
      if (hasInvalid) setActionError('Correct the invalid quantities before saving.');
      return false;
    }

    busyRef.current = true;
    setSaving(true);
    setActionError('');
    setNotice('');
    try {
      const entries = lines
        .filter((line) => (draft[line.product_id] ?? '') !== '')
        .map((line) => ({
          product_id: line.product_id,
          counted_quantity: draft[line.product_id],
        }));

      await saveCount(countId, entries);
      const omitted = lines.length - entries.length;
      setNotice(
        omitted > 0
          ? `Saved ${entries.length} counted quantity entries. ${omitted} blank item(s) were not sent; live inventory has not changed.`
          : 'Draft saved successfully. Live inventory has not changed.',
      );
      return true;
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : 'Failed to save count. Your entries are still here.',
      );
      return false;
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  function proceedToReview() {
    setActionError('');
    if (hasInvalid) {
      setActionError('Correct all invalid quantities before reviewing.');
      return;
    }
    if (uncounted.length) {
      setActionError(`${uncounted.length} product(s) have not been counted. Complete all entries before reviewing.`);
      return;
    }
    if (lines.length === 0) {
      setActionError('This count has no products to review.');
      return;
    }
    setReview(true);
  }

  async function confirm() {
    if (!FINALIZE_ENABLED) return;
    if (!canEdit || busyRef.current || hasInvalid || uncounted.length) return;

    const saved = await save();
    if (!saved) return;

    busyRef.current = true;
    setSaving(true);
    setActionError('');
    try {
      await finalizeCount(countId);
      setNotice('Count finalized. Inventory reconciliation is complete.');
      setReview(false);
      await load();
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : 'Finalization failed. Review live stock and retry only after confirming the count status.',
      );
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="count-workspace count-detail-page">
        <PageHeader
          breadcrumb="Stock Counts"
          title="Stock Count Detail"
          subtitle={locationName || 'Loading location…'}
          actions={<Link to="/inventory_count" className="btn btn-secondary"><ArrowLeft size={16} aria-hidden="true" /> Back to Counts</Link>}
        />

        {loading ? (
          <div className="count-state" role="status">Loading count details…</div>
        ) : error ? (
          <div className="count-state" role="alert">
            <p className="field-error">{error}</p>
            <button className="btn btn-secondary" type="button" onClick={() => void load()}>Try again</button>
          </div>
        ) : !count ? (
          <p role="alert">Count not found.</p>
        ) : (
          <>
            <section className="count-hero" aria-label="Count information">
              <div className="count-hero-icon"><ClipboardCheck size={25} aria-hidden="true" /></div>
              <div className="count-hero-copy">
                <span className="count-eyebrow">WAREHOUSE RECONCILIATION</span>
                <h2>{locationName}</h2>
                <p><MapPin size={14} aria-hidden="true" /> Started {new Date(count.created_at).toLocaleString()}</p>
              </div>
              <span className={`count-status count-status-hero ${complete ? 'count-status-completed' : 'count-status-open'}`}>
                {complete ? 'Completed · Read only' : 'In progress'}
              </span>
            </section>

            <div className="count-metrics" aria-label="Counting progress">
              <div className="count-metric count-metric-primary">
                <span className="count-metric-icon"><ClipboardList size={20} aria-hidden="true" /></span>
                <span className="count-metric-label">Products in snapshot</span>
                <strong className="count-metric-value">{lines.length}</strong>
                <span className="count-metric-caption">Count lines available</span>
              </div>
              <div className="count-metric">
                <span className="count-metric-icon"><CheckCircle2 size={20} aria-hidden="true" /></span>
                <span className="count-metric-label">Counted</span>
                <strong className="count-metric-value">{countedCount}</strong>
                <span className="count-metric-caption">{Math.round(completionPercentage)}% of products</span>
              </div>
              <div className="count-metric">
                <span className="count-metric-icon"><AlertTriangle size={20} aria-hidden="true" /></span>
                <span className="count-metric-label">Differences</span>
                <strong className="count-metric-value">{differences.length}</strong>
                <span className="count-metric-caption">Current entries vs snapshot</span>
              </div>
            </div>

            <progress className="count-progress-track" value={countedCount} max={Math.max(lines.length, 1)} aria-label="Products counted" />

            {notice && <p className="count-feedback count-feedback-success" role="status">{notice}</p>}
            {actionError && <p className="count-feedback count-feedback-error" role="alert">{actionError}</p>}

            {review ? (
              <section className="count-panel" aria-labelledby="review-title">
                <div className="count-panel-heading">
                  <span className="count-section-icon"><AlertTriangle size={19} aria-hidden="true" /></span>
                  <div>
                    <h2 id="review-title">Review discrepancies</h2>
                    <p>Confirm quantities before finalizing the reconciliation.</p>
                  </div>
                </div>
                <p className="count-explanation">
                  Nothing is finalized until you confirm. Expected quantities reflect the count snapshot and may differ from current stock if transactions occurred after the count began.
                </p>
                {differences.length === 0 ? (
                  <div className="count-empty"><CheckCircle2 size={26} aria-hidden="true" /><strong>All quantities match</strong><p>No discrepancies were found.</p></div>
                ) : (
                  <div className="count-table-scroll">
                    <table className="data-table count-table">
                      <thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Difference</th></tr></thead>
                      <tbody>
                        {differences.map((line) => (
                          <tr key={line.product_id}>
                            <td className="count-product-name">{line.product_name || 'Unnamed product'}</td>
                            <td className="mono count-numeric">{line.expected_quantity}</td>
                            <td className="mono count-numeric">{draft[line.product_id]}</td>
                            <td><span className="count-variance count-variance-different">{variance(draft[line.product_id], line.expected_quantity)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="count-footer-actions">
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setReview(false)}>Back to Editing</button>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={saving || !FINALIZE_ENABLED}
                      onClick={() => void confirm()}
                      title={!FINALIZE_ENABLED ? 'Awaiting backend finalization safeguards' : undefined}
                    >
                      {saving ? 'Finalizing…' : 'Confirm Finalization'}
                    </button>
                  )}
                </div>
                {!FINALIZE_ENABLED && canEdit && (
                  <p className="count-explanation" role="status">
                    Finalization remains disabled until backend authorization, decimal-precision and stock-change conflict safeguards are verified. Set VITE_ENABLE_STOCK_COUNT_FINALIZE=true only after the fixes are reviewed and tested.
                  </p>
                )}
              </section>
            ) : (
              <section className="count-panel" aria-labelledby="count-lines-heading">
                <div className="count-panel-heading count-panel-heading-split">
                  <div className="count-heading-group">
                    <span className="count-section-icon"><ClipboardList size={19} aria-hidden="true" /></span>
                    <div><h2 id="count-lines-heading">Counted inventory</h2><p>Enter physical quantities and compare them with the snapshot.</p></div>
                  </div>
                  {complete && <span className="count-readonly"><ShieldCheck size={15} aria-hidden="true" /> Read only</span>}
                </div>
                <div className="count-search-field">
                  <label className="field-label" htmlFor="count-search"><Search size={15} aria-hidden="true" /> Search products</label>
                  <input id="count-search" type="search" className="field-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product name…" />
                </div>

                {lines.length === 0 ? (
                  <div className="count-empty">There are no inventory items in this count snapshot.</div>
                ) : shown.length === 0 ? (
                  <div className="count-empty">No products match your search.</div>
                ) : (
                  <div className="count-table-scroll">
                    <table className="data-table count-table">
                      <thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead>
                      <tbody>
                        {shown.map((line) => {
                          const value = draft[line.product_id] ?? '';
                          const diff = variance(value || null, line.expected_quantity);
                          const inputId = `count-${line.product_id}`;
                          const hintId = `count-hint-${line.product_id}`;
                          return (
                            <tr key={line.product_id}>
                              <td className="count-product-name">{line.product_name || 'Unnamed product'}</td>
                              <td className="mono count-numeric">{line.expected_quantity}</td>
                              <td>
                                <label className="count-input-label" htmlFor={inputId}>Counted quantity — {line.product_name || 'product'}</label>
                                {complete || !allowedToEdit ? (
                                  <span className="mono">{value || 'Not counted'}</span>
                                ) : (
                                  <input
                                    id={inputId}
                                    className="field-input count-quantity-input"
                                    type="text"
                                    inputMode="decimal"
                                    value={value}
                                    disabled={saving}
                                    onChange={(event) => {
                                      setDraft((previous) => ({ ...previous, [line.product_id]: event.target.value }));
                                      setNotice('');
                                    }}
                                    aria-invalid={Boolean(errors[line.product_id])}
                                    aria-describedby={hintId}
                                  />
                                )}
                                <p id={hintId} className={errors[line.product_id] ? 'field-error count-input-hint' : 'field-hint count-input-hint'}>
                                  {errors[line.product_id] || 'Enter a non-negative number; blank entries are not saved by the current backend.'}
                                </p>
                              </td>
                              <td>
                                {diff === null ? (
                                  <span className="count-variance count-variance-pending">Pending</span>
                                ) : diff === '0' ? (
                                  <span className="count-variance count-variance-match"><CheckCircle2 size={14} aria-hidden="true" /> Match</span>
                                ) : (
                                  <span className="count-variance count-variance-different">{diff}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {canEdit && (
                  <div className="count-footer-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => void save()} disabled={saving || hasInvalid}>
                      {saving ? 'Saving…' : 'Save Progress'}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={proceedToReview} disabled={saving || hasInvalid || !!uncounted.length || !lines.length}>
                      Review Differences
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
