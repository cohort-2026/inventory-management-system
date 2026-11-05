import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import Pagination from '../components/Pagination';
import { useAuth } from '../utils/AuthContext';

type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

type InventoryRecord = {
  id: string;
  inventory_id: string;
  product_id: string;
  location_id: string;
  name: string;
  sku: string;
  location_name: string;
  location_code: string;
  quantity: string;
  reorder_level: string;
  stock_status: StockStatus;
  status: string;
  updated_at: string;
};

type InventoryResponse = {
  items: InventoryRecord[];
  page: number;
  pageSize: number;
  total: number;
};

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';
const PAGE_SIZE = 10;

const statusStyle: Record<StockStatus, 'ok' | 'low' | 'out'> = {
  IN_STOCK: 'ok',
  LOW_STOCK: 'low',
  OUT_OF_STOCK: 'out',
};

const statusLabel: Record<StockStatus, string> = {
  IN_STOCK: 'In Stock',
  LOW_STOCK: 'Low Stock',
  OUT_OF_STOCK: 'Out of Stock',
};

async function apiError(response: Response): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return data.error;
  }
  if (response.status === 401) return 'Your session has expired. Please sign in again.';
  if (response.status === 403) return 'You do not have permission to view inventory.';
  return `Unable to load inventory (HTTP ${response.status}).`;
}

export default function InventoryOverview() {
  const { user } = useAuth();
  const canModify = user?.roleName === 'Manager' || user?.roleName === 'Inventory Staff';
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [items, setItems] = useState<InventoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchText.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
          search,
        });
        const response = await fetch(`${API_BASE}/api/inventory?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await apiError(response));
        const result: InventoryResponse = await response.json();
        if (!Array.isArray(result.items) || !Number.isFinite(result.total) || result.total < 0) {
          throw new Error('The inventory API returned an unexpected response.');
        }
        if (!controller.signal.aborted) {
          setItems(result.items);
          setTotal(result.total);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setItems([]);
          setTotal(0);
          setError(caught instanceof Error ? caught.message : 'Unable to load inventory.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, search, refresh]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppLayout>
      <PageHeader
        title="Inventory"
        subtitle="Stock quantities and statuses by product and location."
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>
              Refresh
            </button>
            {canModify && <Link to="/adjust_stock" className="btn btn-primary">Adjust</Link>}
            {canModify && <Link to="/transfer_stock" className="btn btn-secondary">Transfer</Link>}
          </>
        }
      />

      <div className="filter-bar">
        <label className="field" htmlFor="inventory-search" style={{ flex: '1 1 280px', marginBottom: 0 }}>
          <span className="field-label">Search by product name</span>
          <input
            className="field-input"
            id="inventory-search"
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search products..."
            maxLength={200}
          />
        </label>
      </div>

      {loading && <p role="status" className="table-note">Loading inventory records…</p>}
      {error && (
        <div role="alert" className="field-error" style={{ marginBottom: 'var(--space-4)' }}>
          {error}{' '}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRefresh((value) => value + 1)}>Try again</button>
        </div>
      )}
      {!loading && !error && (
        <>
          <DataTable
            columns={[
              { header: 'Product', render: (row: InventoryRecord) => <span title={`Product ID: ${row.product_id}`}>{row.name}<span className="field-hint" style={{ display: 'block' }}>ID: <span className="mono">{row.product_id}</span></span></span> },
              { header: 'SKU', render: (row: InventoryRecord) => row.sku, mono: true },
              { header: 'Location', render: (row: InventoryRecord) => row.location_name },
              { header: 'On Hand', render: (row: InventoryRecord) => row.quantity, mono: true, align: 'right' as const },
              { header: 'Reorder', render: (row: InventoryRecord) => row.reorder_level, mono: true, align: 'right' as const },
              { header: 'Status', render: (row: InventoryRecord) => <Badge status={statusStyle[row.stock_status]}>{statusLabel[row.stock_status] ?? 'Unknown'}</Badge> },
            ]}
            rows={items}
            keyField={(row) => row.inventory_id}
            emptyMessage={search ? 'No inventory records match your search.' : 'No inventory records yet. Stock appears here after it has been received or adjusted at a location.'}
          />
          <p className="table-note">Total records: {total}. Each row represents one product at one location.</p>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        </>
      )}
    </AppLayout>
  );
}
