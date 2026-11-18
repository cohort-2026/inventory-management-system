import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import { useAuth } from '../utils/AuthContext';

type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
type Row = {
  id: string;
  inventory_id: string | null;
  product_id: string;
  location_id: string;
  name: string;
  sku: string;
  category_id: string;
  category_name: string;
  location_name: string;
  location_code: string;
  quantity: string;
  reorder_level: string;
  stock_status: StockStatus;
  status: string;
  last_movement_at: string | null;
};
type ListResponse = { items: Row[]; page: number; pageSize: number; total: number };
type Summary = { total: number; in_stock: number; low_stock: number; out_of_stock: number };
type Option = { id: string; name: string; code?: string; status: string };
const BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api`;
const PAGE_SIZE = 50;
const statuses: Array<{ value: string; label: string; key: keyof Summary }> = [
  { value: '', label: 'All', key: 'total' },
  { value: 'IN_STOCK', label: 'In stock', key: 'in_stock' },
  { value: 'LOW_STOCK', label: 'Low', key: 'low_stock' },
  { value: 'OUT_OF_STOCK', label: 'Out', key: 'out_of_stock' },
];
async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal });
  if (!response.ok) {
    const body: { error?: string } = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (HTTP ${response.status}).`);
  }
  return response.json() as Promise<T>;
}
function presentDate(input: string | null): string {
  if (!input) return 'Never';
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function stockChip(status: StockStatus) {
  const style = status === 'IN_STOCK' ? 'ok' : status === 'LOW_STOCK' ? 'low' : 'out';
  const label = status === 'IN_STOCK' ? 'In stock' : status === 'LOW_STOCK' ? 'Low stock' : 'Out of stock';
  return <Badge status={style}>{label}</Badge>;
}

export default function InventoryOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const location = params.get('location') ?? '';
  const category = params.get('category') ?? '';
  const status = params.get('status') ?? '';
  const parsedPage = Number(params.get('page') ?? '1');
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [text, setText] = useState(search);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [locations, setLocations] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [optionsError, setOptionsError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const canModify = user?.roleName === 'Manager' || user?.roleName === 'Inventory Staff';

  function update(next: Record<string, string>) {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    copy.delete('page');
    setSelected([]);
    setParams(copy);
  }
  useEffect(() => { setText(search); }, [search]);
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all([
      json<{ items: Array<{ location_id: string; name: string; code: string; status: string }> }>(`${BASE}/locations`, abort.signal),
      json<{ items: Array<{ category_id: string; name: string; status: string }> }>(`${BASE}/categories`, abort.signal),
    ]).then(([sites, cats]) => {
      setLocations(sites.items.filter(s => s.status === 'active').map(s => ({ id: s.location_id, name: s.name, code: s.code, status: s.status })));
      setCategories(cats.items.filter(c => c.status === 'active').map(c => ({ id: c.category_id, name: c.name, status: c.status })));
      setOptionsError('');
    }).catch(e => { if (!abort.signal.aborted) setOptionsError(e instanceof Error ? e.message : 'Unable to load filters.'); });
    return () => abort.abort();
  }, [revision]);
  const filterParams = useMemo(() => {
    const url = new URLSearchParams();
    if (search) url.set('search', search);
    if (location) url.set('location', location);
    if (category) url.set('category', category);
    if (status) url.set('status', status);
    return url;
  }, [search, location, category, status]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    const listQuery = new URLSearchParams(filterParams);
    listQuery.set('page', String(page));
    listQuery.set('pageSize', String(PAGE_SIZE));
    const summaryQuery = new URLSearchParams(filterParams);
    summaryQuery.delete('status');
    void Promise.all([
      json<ListResponse>(`${BASE}/inventory?${listQuery}`, abort.signal),
      json<Summary>(`${BASE}/inventory/summary?${summaryQuery}`, abort.signal),
    ]).then(([list, totals]) => {
      if (abort.signal.aborted) return;
      if (!Array.isArray(list.items) || !Number.isSafeInteger(list.total)) throw new Error('Invalid inventory API response.');
      setRows(list.items);
      setTotal(list.total);
      setSummary(totals);
    }).catch(e => {
      if (abort.signal.aborted) return;
      setRows([]);
      setTotal(0);
      setSummary(null);
      setError(e instanceof Error ? e.message : 'Unable to load stock.');
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [filterParams, page, revision]);
  const visibleKeys = rows.map(r => r.id);
  const allChecked = rows.length > 0 && rows.every(r => selected.includes(r.id));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { setSelected([]); }, [filterParams, page]);

  async function exportCsv(selectedOnly: boolean) {
    setExporting(true);
    setExportError('');
    const query = new URLSearchParams(filterParams);
    if (selectedOnly) query.set('selected', selected.join(','));
    try {
      const response = await fetch(`${BASE}/inventory/export.csv?${query}`, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        const data: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Export failed (HTTP ${response.status}).`);
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'stock-on-hand.csv';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (e) { setExportError(e instanceof Error ? e.message : 'Unable to export.'); }
    finally { setExporting(false); }
  }
  async function scanSku(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scanned = text.trim();
    if (!scanned) { update({ search: '' }); return; }
    try {
      const query = new URLSearchParams({ search: scanned, page: '1', pageSize: '100' });
      const result = await json<ListResponse>(`${BASE}/inventory?${query}`);
      const match = result.items.find(r => r.sku.toLowerCase() === scanned.toLowerCase());
      if (match) { navigate(`/products/${encodeURIComponent(match.product_id)}`); return; }
    } catch { /* Preserve the typed term; the regular list will show any API error. */ }
    update({ search: scanned });
  }
  return <AppLayout>
    <div className="enterprise-inventory">
      <PageHeader title="Stock on hand" subtitle="Live quantities across active products and active locations."
        actions={<>
          <button type="button" className="btn btn-secondary" onClick={() => setRevision(n => n + 1)} disabled={loading}>Refresh</button>
          {canModify && <Link className="btn btn-primary" to="/adjust_stock">Adjust</Link>}
          {canModify && <Link className="btn btn-secondary" to="/transfer_stock">Transfer</Link>}
        </>} />
      <section className="f04-location-tabs" aria-label="Location selection">
        <button type="button" className={location ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => update({ location: '' })}>All locations</button>
        {locations.map(loc => <button key={loc.id} type="button" className={location === loc.id ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => update({ location: loc.id })}>{loc.name}</button>)}
      </section>
      <div className="f04-summary" aria-label="Stock status filters">
        {statuses.map(s => <button key={s.label} type="button" aria-pressed={status === s.value} className={`f04-summary-item${status === s.value ? ' selected' : ''}`} onClick={() => update({ status: s.value })}>
          <span>{s.label}</span><strong>{summary ? summary[s.key] : '—'}</strong>
        </button>)}
      </div>
      <div className="f04-filter-bar">
        <form onSubmit={e => { void scanSku(e); }}>
          <label htmlFor="f04-search">Search name or SKU (Enter opens an exact SKU)</label>
          <input id="f04-search" className="field-input" value={text} maxLength={200} onChange={e => setText(e.target.value)} placeholder="Search or scan SKU" />
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
        <label>Category
          <select className="field-input" value={category} onChange={e => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button className="btn btn-secondary" type="button" onClick={() => { void exportCsv(false); }} disabled={exporting}>Export filtered CSV</button>
        <button className="btn btn-secondary" type="button" onClick={() => { void exportCsv(true); }} disabled={exporting || selected.length === 0}>Export selected ({selected.length})</button>
      </div>
      {optionsError && <p role="alert">Filter options unavailable: {optionsError}</p>}
      {exportError && <p role="alert">{exportError}</p>}
      {loading && <p role="status">Loading stock on hand…</p>}
      {error && <p role="alert">{error} <button className="btn btn-secondary btn-sm" type="button" onClick={() => setRevision(n => n + 1)}>Retry</button></p>}
      {!loading && !error && <>
        {rows.length === 0 && <p role="status">{search || location || category || status ? 'No products match these filters.' : 'There are no active products or active locations.'}</p>}
        {rows.length > 0 && <div className="f04-table enterprise-table-surface">
          <DataTable<Row>
            rows={rows} keyField={r => r.id}
            columns={[
              { header: 'Select', render: r => <input type="checkbox" aria-label={`Select ${r.name} at ${r.location_name}`} checked={selected.includes(r.id)} onChange={e => setSelected(old => e.target.checked ? [...old, r.id] : old.filter(id => id !== r.id))} /> },
              { header: 'Product', render: r => <Link className="table-link" to={`/products/${encodeURIComponent(r.product_id)}`}>{r.name}</Link> },
              { header: 'SKU', render: r => r.sku, mono: true },
              { header: 'Category', render: r => r.category_name },
              { header: 'Location', render: r => `${r.location_name} (${r.location_code})` },
              { header: 'On hand', render: r => r.quantity, mono: true, align: 'right' },
              { header: 'Minimum', render: r => r.reorder_level, mono: true, align: 'right' },
              { header: 'Status', render: r => stockChip(r.stock_status) },
              { header: 'Last movement', render: r => presentDate(r.last_movement_at) },
            ]} />
          <label className="f04-select-all"><input type="checkbox" checked={allChecked} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...visibleKeys])] : selected.filter(id => !visibleKeys.includes(id)))} /> Select all on this page</label>
        </div>}
        <div className="f04-page-bar">
          <span>{total} product/location entries · Page {page} of {totalPages}</span>
          <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page - 1)); setParams(next); }}>Previous</button>
          <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => { const next = new URLSearchParams(params); next.set('page', String(page + 1)); setParams(next); }}>Next</button>
        </div>
      </>}
    </div>
  </AppLayout>;
}
