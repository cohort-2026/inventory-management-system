
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import Pagination from '../components/Pagination';
import { useAuth } from '../utils/AuthContext';
import {
  exportInventoryCsv,
  getInventoryPage,
  getInventorySummary,
  getLocations,
} from '../services/api';
import type {
  InventoryFilters,
  InventoryPageRecord,
  InventoryStockStatus,
  InventorySummary,
  LocationOption,
} from '../services/api';

const PAGE_SIZE = 10;

const statusStyle: Record<
  InventoryStockStatus,
  'ok' | 'low' | 'out'
> = {
  IN_STOCK: 'ok',
  LOW_STOCK: 'low',
  OUT_OF_STOCK: 'out',
};

const statusLabel: Record<InventoryStockStatus, string> = {
  IN_STOCK: 'In Stock',
  LOW_STOCK: 'Low Stock',
  OUT_OF_STOCK: 'Out of Stock',
};

const emptySummary: InventorySummary = {
  total: 0,
  in_stock: 0,
  low_stock: 0,
  out_of_stock: 0,
};

export default function InventoryOverview() {
  const { user } = useAuth();

  const isManager = user?.roleName === 'Manager';

  const canAdjust =
    isManager || user?.roleName === 'Inventory Staff';

  const [page, setPage] = useState(1);

  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');

  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<InventoryStockStatus | ''>('');

  const [locations, setLocations] = useState<LocationOption[]>([]);

  const [items, setItems] = useState<InventoryPageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] =
    useState<InventorySummary>(emptySummary);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [refresh, setRefresh] = useState(0);

  // Debounce product search.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchText.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchText]);

  // Managers can choose a location.
  // Inventory Staff remain restricted by the backend to their home location.
  useEffect(() => {
    if (!isManager) {
      setLocations([]);
      return;
    }

    let active = true;

    async function loadLocations() {
      try {
        const result = await getLocations();

        if (active) {
          setLocations(result);
          setLocationError('');
        }
      } catch (caught) {
        if (active) {
          setLocationError(
            caught instanceof Error
              ? caught.message
              : 'Unable to load locations.',
          );
        }
      }
    }

    void loadLocations();

    return () => {
      active = false;
    };
  }, [isManager, refresh]);

  // Load the inventory page and summary.
  useEffect(() => {
    let active = true;

    async function loadInventory() {
      setLoading(true);
      setError('');

      const filters: InventoryFilters = {
        search,
        location,
        status,
        page,
        pageSize: PAGE_SIZE,
      };

      const summaryFilters: InventoryFilters = {
        search,
        location,
      };

      try {
        const [pageResult, summaryResult] = await Promise.all([
          getInventoryPage(filters),
          getInventorySummary(summaryFilters),
        ]);

        if (!active) {
          return;
        }

        setItems(pageResult.items);
        setTotal(pageResult.total);
        setSummary(summaryResult);
      } catch (caught) {
        if (!active) {
          return;
        }

        setItems([]);
        setTotal(0);
        setSummary(emptySummary);

        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to load inventory.',
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadInventory();

    return () => {
      active = false;
    };
  }, [page, search, location, status, refresh]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleLocationChange(value: string) {
    setLocation(value);
    setPage(1);
  }

  function handleStatusChange(value: InventoryStockStatus | '') {
    setStatus((current) => current === value ? '' : value);
    setPage(1);
  }

  async function handleExport() {
    setExporting(true);
    setError('');

    try {
      await exportInventoryCsv({
        search,
        location,
        status,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to export inventory.',
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppLayout>
      <div className="enterprise-inventory">
        <PageHeader
          title="Inventory"
          subtitle="Stock quantities and statuses by product and location."
          actions={
            <>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setRefresh((value) => value + 1)}
                disabled={loading}
              >
                Refresh
              </button>

              <button
                className="btn btn-secondary"
                type="button"
                onClick={handleExport}
                disabled={exporting || loading}
              >
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>

              {canAdjust && (
                <Link to="/adjust_stock" className="btn btn-primary">
                  Adjust
                </Link>
              )}

              {isManager && (
                <Link
                  to="/transfer_stock"
                  className="btn btn-secondary"
                >
                  Transfer
                </Link>
              )}
            </>
          }
        />

        {/* Inventory summary */}
        <div className="f04-summary">
          <button
            type="button"
            className={`f04-summary-item${status === '' ? ' selected' : ''}`}
            onClick={() => handleStatusChange('')}
            aria-pressed={status === ''}
          >
            <span className="f04-summary-label">
              Total Products
            </span>
            <strong>{summary.total}</strong>
          </button>

          <button
            type="button"
            className={`f04-summary-item${status === 'IN_STOCK' ? ' selected' : ''}`}
            onClick={() => handleStatusChange('IN_STOCK')}
            aria-pressed={status === 'IN_STOCK'}
          >
            <span className="f04-summary-label">
              In Stock
            </span>
            <strong>{summary.in_stock}</strong>
          </button>

          <button
            type="button"
            className={`f04-summary-item${status === 'LOW_STOCK' ? ' selected' : ''}`}
            onClick={() => handleStatusChange('LOW_STOCK')}
            aria-pressed={status === 'LOW_STOCK'}
          >
            <span className="f04-summary-label">
              Low Stock
            </span>
            <strong>{summary.low_stock}</strong>
          </button>

          <button
            type="button"
            className={`f04-summary-item${status === 'OUT_OF_STOCK' ? ' selected' : ''}`}
            onClick={() => handleStatusChange('OUT_OF_STOCK')}
            aria-pressed={status === 'OUT_OF_STOCK'}
          >
            <span className="f04-summary-label">
              Out of Stock
            </span>
            <strong>{summary.out_of_stock}</strong>
          </button>
        </div>

        {/* Search and filters */}
        <div className="f04-filter-bar">
          <label
            className="field"
            htmlFor="inventory-search"
            style={{
              flex: '1 1 280px',
              minWidth: 0,
              marginBottom: 0,
            }}
          >
            <span className="field-label">
              Search product or SKU
            </span>

            <input
              className="field-input"
              id="inventory-search"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search products or SKU..."
              maxLength={200}
            />
          </label>

          {isManager && (
            <label
              className="field"
              htmlFor="inventory-location"
              style={{
                flex: '0 1 240px',
                minWidth: 0,
                marginBottom: 0,
              }}
            >
              <span className="field-label">
                Location
              </span>

              <select
                className="field-input"
                id="inventory-location"
                value={location}
                onChange={(event) =>
                  handleLocationChange(event.target.value)
                }
              >
                <option value="">All locations</option>

                {locations.map((item) => (
                  <option
                    key={item.location_id}
                    value={item.location_id}
                  >
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {locationError && (
          <div role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            {locationError}
          </div>
        )}

        {error && (
          <div role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            {error}{' '}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setRefresh((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {loading && (
          <p role="status" className="table-note">
            Loading inventory records…
          </p>
        )}

        {!loading && !error && (
          <>
            <DataTable
              columns={[
                {
                  header: 'Product',
                  render: (row: InventoryPageRecord) => (
                    <span title={`Product ID: ${row.product_id}`}>
                      {row.name}
                      <span
                        className="field-hint"
                        style={{ display: 'block' }}
                      >
                        ID:{' '}
                        <span className="mono">
                          {row.product_id}
                        </span>
                      </span>
                    </span>
                  ),
                },
                {
                  header: 'SKU',
                  render: (row: InventoryPageRecord) => row.sku,
                  mono: true,
                },
                {
                  header: 'Location',
                  render: (row: InventoryPageRecord) =>
                    row.location_name,
                },
                {
                  header: 'On Hand',
                  render: (row: InventoryPageRecord) => row.quantity,
                  mono: true,
                  align: 'right' as const,
                },
                {
                  header: 'Reorder',
                  render: (row: InventoryPageRecord) =>
                    row.reorder_level,
                  mono: true,
                  align: 'right' as const,
                },
                {
                  header: 'Status',
                  render: (row: InventoryPageRecord) => (
                    <Badge status={statusStyle[row.stock_status]}>
                      {statusLabel[row.stock_status]}
                    </Badge>
                  ),
                },
              ]}
              rows={items}
              keyField={(row: InventoryPageRecord) => row.id}
              emptyMessage={
                search || location || status
                  ? 'No inventory records match your selected filters.'
                  : 'No inventory records yet. Stock appears here after it has been received or adjusted at a location.'
              }
            />

            <p className="table-note">
              Total records: {total}. Each row represents one
              product at one location.
            </p>

            {totalPages > 1 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
