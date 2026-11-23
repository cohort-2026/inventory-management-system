import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, RotateCcw, ShieldCheck } from 'lucide-react';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import {
  getCountReview,
  cancelActiveCount,
  listVarianceReasons,
  postApprovedCount,
  requestCountRecount,
  saveVarianceReasons,
} from '../services/stockCountApi';
import type { CountReason, CountReview, CountReviewLine } from '../services/stockCountApi';

type ReasonDraft = { reason_code_id: string; reason_note: string };

function signed(value: string | null): string {
  if (value === null) return '—';
  return value.startsWith('-') || value === '0' ? value : `+${value}`;
}

export default function InventoryCountReview() {
  const { countId = '' } = useParams<{ countId: string }>();
  const navigate = useNavigate();
  const [review, setReview] = useState<CountReview | null>(null);
  const [reasons, setReasons] = useState<CountReason[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ReasonDraft>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [recountNote, setRecountNote] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, availableReasons] = await Promise.all([
        getCountReview(countId),
        listVarianceReasons(),
      ]);
      setReview(result);
      setReasons(availableReasons);
      setDrafts(Object.fromEntries(result.items.map(line => [
        line.product_id,
        { reason_code_id: line.reason_code_id ?? '', reason_note: line.reason_note ?? '' },
      ])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Manager review.');
    } finally {
      setLoading(false);
    }
  }, [countId]);

  useEffect(() => { void reload(); }, [reload]);

  const lines = review?.items ?? [];
  const readOnly = review?.count.status === 'POSTED';
  const differences = useMemo(() => lines.filter(line => line.has_variance), [lines]);
  const significant = differences.filter(line => line.is_significant).length;
  const conflicts = lines.filter(line => line.snapshot_conflict).length;
  const missingReason = differences.some(line => !drafts[line.product_id]?.reason_code_id);
  const savedReasons = differences.every(line =>
    line.reason_code_id === drafts[line.product_id]?.reason_code_id &&
    (line.reason_note ?? '') === (drafts[line.product_id]?.reason_note.trim() ?? ''),
  );

  function changeReason(productId: string, field: keyof ReasonDraft, value: string): void {
    setDrafts(previous => ({
      ...previous,
      [productId]: { ...previous[productId], [field]: value },
    }));
    setActionError('');
    setNotice('');
  }

  async function saveReasons(): Promise<void> {
    if (busy || readOnly || missingReason) return;
    setBusy(true);
    setActionError('');
    try {
      await saveVarianceReasons(countId, differences.map(line => ({
        product_id: line.product_id,
        reason_code_id: drafts[line.product_id]?.reason_code_id ?? '',
        reason_note: drafts[line.product_id]?.reason_note.trim() || null,
      })));
      await reload();
      setNotice('Variance reasons saved. Stock has not changed.');
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Unable to save reasons.');
    } finally {
      setBusy(false);
    }
  }

  async function requestRecount(): Promise<void> {
    if (busy || readOnly || selected.length === 0 || !recountNote.trim()) return;
    if (!window.confirm(`Request a recount of ${selected.length} product(s)?`)) return;
    setBusy(true);
    setActionError('');
    try {
      await requestCountRecount(countId, selected, recountNote.trim());
      navigate(`/counts/${encodeURIComponent(countId)}`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Recount request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (busy || readOnly || !cancelNote.trim()) return;
    if (!window.confirm('Cancel this count? You will need to create a new count to capture a fresh snapshot.')) return;
    setBusy(true);
    setActionError('');
    try {
      await cancelActiveCount(countId, cancelNote.trim());
      navigate(`/counts/${encodeURIComponent(countId)}`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Cancellation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function post(): Promise<void> {
    if (busy || readOnly || !savedReasons || missingReason || conflicts > 0) return;
    if (!window.confirm('Approve and post this stock count? Inventory and the audit ledger will change immediately.')) return;
    setBusy(true);
    setActionError('');
    try {
      await postApprovedCount(countId);
      navigate(`/counts/${encodeURIComponent(countId)}`);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Posting failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <div className="count-workspace count-review-workspace">
        <PageHeader
          breadcrumb="Stock Counts"
          title="Manager variance review"
          subtitle={review ? `${review.count.count_no} · Approve differences or request a recount` : 'Loading submitted count'}
          actions={<Link to={`/counts/${encodeURIComponent(countId)}`} className="btn btn-secondary"><ArrowLeft size={16} /> Back to count</Link>}
        />
        {loading ? (
          <p className="count-state" role="status">Loading count review…</p>
        ) : error ? (
          <div className="count-state" role="alert">
            <p>{error}</p>
            <button className="btn btn-secondary" type="button" onClick={() => void reload()}>Retry</button>
          </div>
        ) : review ? (
          <>
            <section className="count-hero">
              <div className="count-hero-icon"><ShieldCheck size={24} aria-hidden="true" /></div>
              <div className="count-hero-copy">
                <span className="count-eyebrow">MANAGER APPROVAL</span>
                <h2>{review.count.count_no}</h2>
                <p>Submitted count · Round {review.count.recount_round + 1}</p>
              </div>
              <span className="count-hero-pill">{review.count.status}</span>
            </section>
            <div className="count-metrics">
              <div className="count-metric count-metric-primary">
                <span className="count-metric-icon"><ClipboardCheck size={19} /></span>
                <span className="count-metric-label">Products reviewed</span>
                <strong className="count-metric-value">{lines.length}</strong>
              </div>
              <div className="count-metric">
                <span className="count-metric-icon"><AlertTriangle size={19} /></span>
                <span className="count-metric-label">Significant variances</span>
                <strong className="count-metric-value">{significant}</strong>
              </div>
              <div className="count-metric">
                <span className="count-metric-icon"><ShieldCheck size={19} /></span>
                <span className="count-metric-label">Snapshot conflicts</span>
                <strong className="count-metric-value">{conflicts}</strong>
              </div>
            </div>
            {conflicts > 0 && (
              <p className="count-feedback count-feedback-error" role="alert">
                Live stock changed since this count began. Posting is blocked. Reconcile subsequent movements before proceeding.
              </p>
            )}
            {actionError && <p className="count-feedback count-feedback-error" role="alert">{actionError}</p>}
            {notice && <p className="count-feedback count-feedback-success" role="status">{notice}</p>}
            <section className="count-panel" aria-labelledby="variance-review-heading">
              <div className="count-panel-heading">
                <span className="count-section-icon"><ClipboardCheck size={19} /></span>
                <div>
                  <h2 id="variance-review-heading">Expected vs. counted</h2>
                  <p>Assign a reason to every nonzero variance. Select products if you need a recount.</p>
                </div>
              </div>
              {lines.length === 0 ? (
                <p className="count-empty">No count lines to review.</p>
              ) : (
                <div className="count-table-scroll">
                  <table className="data-table count-table count-review-table">
                    <thead>
                      <tr><th>Recount</th><th>Product</th><th>Expected</th><th>Counted</th><th>Difference</th><th>Variance reason</th></tr>
                    </thead>
                    <tbody>
                      {lines.map((line: CountReviewLine) => {
                        const isDifference = line.has_variance;
                        const choice = drafts[line.product_id];
                        const chosenReason = reasons.find(reason => reason.reason_code_id === choice?.reason_code_id);
                        return (
                          <tr key={line.product_id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Request recount for ${line.product_name}`}
                                checked={selected.includes(line.product_id)}
                                onChange={event => setSelected(old => event.target.checked
                                  ? [...old, line.product_id]
                                  : old.filter(id => id !== line.product_id))}
                              />
                            </td>
                            <td><strong>{line.product_name}</strong><span className="field-hint">{line.sku}</span></td>
                            <td className="mono">{line.expected_quantity}</td>
                            <td className="mono">{line.counted_quantity ?? 'Pending'}</td>
                            <td className="mono">
                              {signed(line.variance)}
                              {line.is_significant && <span className="count-review-flag">Significant</span>}
                            </td>
                            <td>
                              {isDifference ? (
                                <div className="count-review-reason">
                                  <label htmlFor={`reason-${line.product_id}`} className="count-input-label">Reason for {line.product_name}</label>
                                  <select
                                    id={`reason-${line.product_id}`}
                                    className="field-select"
                                    value={choice?.reason_code_id ?? ''}
                                    disabled={busy || readOnly}
                                    onChange={event => changeReason(line.product_id, 'reason_code_id', event.target.value)}
                                  >
                                    <option value="">Choose a reason</option>
                                    {reasons.map(reason => (
                                      <option key={reason.reason_code_id} value={reason.reason_code_id}>{reason.label}</option>
                                    ))}
                                  </select>
                                  <label htmlFor={`note-${line.product_id}`} className="count-input-label">Explanation{chosenReason?.requires_note ? ' (required)' : ' (optional)'}</label>
                                  <input
                                    id={`note-${line.product_id}`}
                                    type="text"
                                    className="field-input"
                                    maxLength={2000}
                                    value={choice?.reason_note ?? ''}
                                    disabled={busy || readOnly}
                                    onChange={event => changeReason(line.product_id, 'reason_note', event.target.value)}
                                  />
                                </div>
                              ) : <span className="field-hint">No variance</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="count-footer-actions">
                <button type="button" className="btn btn-secondary" disabled={busy || readOnly || differences.length === 0 || missingReason || savedReasons} onClick={() => void saveReasons()}>
                  Save reasons
                </button>
                <button type="button" className="btn btn-primary" disabled={busy || readOnly || !savedReasons || missingReason || conflicts > 0 || lines.length === 0} onClick={() => void post()}>
                  <CheckCircle2 size={16} /> {busy ? 'Working…' : 'Approve and Post'}
                </button>
              </div>
            </section>
            {!readOnly && <section className="count-panel" aria-labelledby="recount-heading">
              <div className="count-panel-heading">
                <span className="count-section-icon"><RotateCcw size={19} /></span>
                <div><h2 id="recount-heading">Request a recount</h2><p>Only selected products will reopen for entry. Earlier observations remain in the audit history.</p></div>
              </div>
              <div className="count-review-recount-form">
                <label className="field-label" htmlFor="recount-note">Why is another count needed?</label>
                <textarea id="recount-note" className="field-textarea" value={recountNote} maxLength={2000} onChange={event => setRecountNote(event.target.value)} placeholder="Explain the recount request…" />
                <button type="button" className="btn btn-secondary" disabled={busy || readOnly || selected.length === 0 || !recountNote.trim()} onClick={() => void requestRecount()}>
                  <RotateCcw size={16} /> Request recount ({selected.length})
                </button>
              </div>
            </section>}
            {!readOnly && <section className="count-panel" aria-labelledby="cancel-count-heading">
              <div className="count-panel-heading">
                <span className="count-section-icon"><AlertTriangle size={19} /></span>
                <div>
                  <h2 id="cancel-count-heading">Cancel stale count</h2>
                  <p>If stock changed since the snapshot, cancel and start a fresh count. Cancellation does not adjust inventory.</p>
                </div>
              </div>
              <div className="count-review-recount-form">
                <label className="field-label" htmlFor="count-cancel-note">Cancellation explanation</label>
                <textarea id="count-cancel-note" className="field-textarea" maxLength={2000} value={cancelNote} onChange={event => setCancelNote(event.target.value)} />
                <button className="btn btn-danger" type="button" disabled={busy || readOnly || !cancelNote.trim()} onClick={() => void cancel()}>
                  Cancel this count
                </button>
              </div>
            </section>}
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
