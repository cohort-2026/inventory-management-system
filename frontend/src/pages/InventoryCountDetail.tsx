import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../utils/AuthContext';
import { finalizeCount, getCountDetail, listCountLocations, saveCount } from '../services/stockCountApi';
import type { CountLine, StockCount } from '../services/stockCountApi';

const FINALIZE_ENABLED = import.meta.env.VITE_ENABLE_STOCK_COUNT_FINALIZE === 'true';
const NONNEGATIVE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
function validQuantity(value: string): boolean { return value.length <= 100 && NONNEGATIVE.test(value); }
function variance(counted: string | null, expected: string): string | null {
  if (counted === null || !validQuantity(counted)) return null;
  // UI preview; backend remains authoritative for precise NUMERIC arithmetic.
  const difference = Number(counted) - Number(expected);
  return Number.isFinite(difference) ? String(Number(difference.toPrecision(12))) : null;
}

export default function InventoryCountDetail() {
  const { countId = '' } = useParams<{countId: string}>();
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
      const [detail, locations] = await Promise.all([getCountDetail(countId), listCountLocations()]);
      const { count: record, items } = detail;
      setCount(record); setLines(items);
      setLocationName(locations.find(x => x.location_id === record.location_id)?.name ?? record.location_id);
      setDraft(Object.fromEntries(items.map(x => [x.product_id, x.counted_quantity ?? ''])));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load count details.'); }
    finally { setLoading(false); }
  }, [countId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const complete = count?.status === 'completed';
  const canEdit = allowedToEdit && count?.status === 'open';
  const errors = useMemo(() => Object.fromEntries(lines.filter(x => {
    const input = draft[x.product_id] ?? '';
    return input !== '' && !validQuantity(input);
  }).map(x => [x.product_id, 'Enter a non-negative decimal quantity.'])), [draft, lines]);
  const hasInvalid = Object.keys(errors).length > 0;
  const uncounted = lines.filter(x => (draft[x.product_id] ?? '') === '');
  const differences = lines.filter(x => {
    const value = draft[x.product_id] ?? '';
    return value !== '' && !errors[x.product_id] && variance(value, x.expected_quantity) !== '0';
  });
  const shown = lines.filter(x => `${x.product_name ?? ''} ${x.product_id}`.toLowerCase().includes(search.toLowerCase()));

  async function save(): Promise<boolean> {
    if (!canEdit || busyRef.current || hasInvalid) {
      if (hasInvalid) setActionError('Correct the invalid quantities before saving.');
      return false;
    }
    busyRef.current = true; setSaving(true); setActionError(''); setNotice('');
    try {
      const entries = lines
        .filter(x => (draft[x.product_id] ?? '') !== '')
        .map(x => ({product_id:x.product_id, counted_quantity:draft[x.product_id]}));
      await saveCount(countId, entries);
      const omitted = lines.length - entries.length;
      setNotice(omitted > 0
        ? `Saved ${entries.length} counted quantity entries. ${omitted} blank item(s) were not sent; live inventory has not changed.`
        : 'Draft saved successfully. Live inventory has not changed.');
      return true;
    } catch(e) { setActionError(e instanceof Error ? e.message : 'Failed to save count. Your entries are still here.'); return false; }
    finally { busyRef.current = false; setSaving(false); }
  }
  function proceedToReview() {
    setActionError('');
    if (hasInvalid) { setActionError('Correct all invalid quantities before reviewing.'); return; }
    if (uncounted.length) { setActionError(`${uncounted.length} product(s) have not been counted. Complete all entries before reviewing.`); return; }
    if (lines.length === 0) { setActionError('This count has no products to review.'); return; }
    setReview(true);
  }
  async function confirm() {
    if (!FINALIZE_ENABLED) return;
    if (!canEdit || busyRef.current || hasInvalid || uncounted.length) return;
    const saved = await save();
    if (!saved) return;
    busyRef.current = true; setSaving(true); setActionError('');
    try {
      await finalizeCount(countId);
      setNotice('Count finalized. Inventory reconciliation is complete.');
      setReview(false);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Finalization failed. Review live stock and retry only after confirming the count status.');
    } finally { busyRef.current = false; setSaving(false); }
  }
  return <AppLayout>
    <PageHeader breadcrumb="Stock Counts" title="Stock Count" subtitle={locationName || 'Loading location…'} actions={<Link to="/inventory_count" className="btn btn-secondary">Back to Counts</Link>} />
    {loading ? <p role="status">Loading count details…</p> : error ? <div role="alert"><p className="field-error">{error}</p><button className="btn btn-secondary" type="button" onClick={() => void load()}>Try again</button></div> : !count ? <p role="alert">Count not found.</p> : <>
      <p style={{marginBottom:'var(--space-4)'}}>Status: <strong>{complete ? 'Completed (read-only)' : 'In progress'}</strong> · Started: {new Date(count.created_at).toLocaleString()}</p>
      {notice && <p role="status" style={{color:'var(--color-success)', marginBottom:'var(--space-3)'}}>{notice}</p>}
      {actionError && <p className="field-error" role="alert" style={{marginBottom:'var(--space-3)'}}>{actionError}</p>}
      {review ? <section aria-labelledby="review-title">
        <h2 id="review-title" style={{marginBottom:'var(--space-3)'}}>Review discrepancies before finalizing</h2>
        <p className="field-hint" style={{marginBottom:'var(--space-3)'}}>No data is finalized until Confirm Finalization. Expected quantities reflect the count snapshot and may differ from current stock if transactions occurred since the count began.</p>
        {differences.length === 0 ? <p className="table-empty">No differences. Every counted quantity matches its expected quantity.</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Difference</th></tr></thead><tbody>{differences.map(x => <tr key={x.product_id}><td>{x.product_name || x.product_id}</td><td className="mono">{x.expected_quantity}</td><td className="mono">{draft[x.product_id]}</td><td className="mono">Difference: {variance(draft[x.product_id], x.expected_quantity)}</td></tr>)}</tbody></table></div>}
        <div className="page-actions" style={{marginTop:'var(--space-4)'}}><button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setReview(false)}>Back to Editing</button>{canEdit && <button type="button" className="btn btn-danger" disabled={saving || !FINALIZE_ENABLED} onClick={() => void confirm()} title={!FINALIZE_ENABLED ? 'Awaiting backend finalization safeguards' : undefined}>{saving ? 'Finalizing…' : 'Confirm Finalization'}</button>}</div>
        {!FINALIZE_ENABLED && canEdit && <p className="field-hint" role="status" style={{marginTop:'var(--space-3)'}}>Finalization remains disabled until backend authorization, decimal-precision and stock-change conflict safeguards are verified. Set VITE_ENABLE_STOCK_COUNT_FINALIZE=true only after the fixes are reviewed and tested.</p>}
      </section> : <>
        <div className="field" style={{maxWidth:420}}><label className="field-label" htmlFor="count-search">Search products</label><input id="count-search" type="search" className="field-input" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {lines.length === 0 ? <p className="table-empty">There are no inventory items in this count snapshot.</p> : shown.length === 0 ? <p className="table-empty">No products match your search.</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>{shown.map(x => {
          const value = draft[x.product_id] ?? '';
          const diff = variance(value || null, x.expected_quantity);
          const inputId = `count-${x.product_id}`;
          const hintId = `count-hint-${x.product_id}`;
          return <tr key={x.product_id}><td>{x.product_name || x.product_id}</td><td className="mono">{x.expected_quantity}</td><td><label className="field-label" htmlFor={inputId}>Counted quantity — {x.product_name || x.product_id}</label>{complete || !allowedToEdit ? <p className="mono">{value || 'Not counted'}</p> : <input id={inputId} className="field-input" style={{maxWidth:180}} type="text" inputMode="decimal" value={value} disabled={saving} onChange={e => {setDraft(prev => ({...prev,[x.product_id]:e.target.value})); setNotice('');}} aria-invalid={Boolean(errors[x.product_id])} aria-describedby={hintId} />}
            <p id={hintId} className={errors[x.product_id] ? 'field-error' : 'field-hint'}>{errors[x.product_id] || 'Enter a non-negative number; blank entries are not saved by the current backend.'}</p></td><td>{diff === null ? 'Pending' : diff === '0' ? 'Match (0)' : `Difference (${diff})`}</td></tr>;
        })}</tbody></table></div>}
        {canEdit && <div className="page-actions" style={{marginTop:'var(--space-4)', flexWrap:'wrap'}}><button type="button" className="btn btn-secondary" onClick={() => void save()} disabled={saving || hasInvalid}>{saving ? 'Saving…' : 'Save Progress'}</button><button type="button" className="btn btn-primary" onClick={proceedToReview} disabled={saving || hasInvalid || !!uncounted.length || !lines.length}>Review Differences</button></div>}
      </>}
    </>}
  </AppLayout>;
}
