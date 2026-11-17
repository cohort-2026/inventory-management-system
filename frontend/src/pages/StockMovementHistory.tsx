
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import {
  getProducts,
  getLocations,
  type ProductOption,
  type LocationOption,
} from '../services/api';

type Entity = {
  location_id: string;
  name: string;
  code: string;
};

type Movement = {
  movement_id: string;
  movement_no: string;
  movement_type: string;
  product: {
    product_id: string;
    name: string;
    sku: string;
  };
  location: Entity;
  second_location: Entity | null;
  paired_movement_id: string | null;
  quantity_change: string;
  quantity_before: string;
  quantity_after: string;
  user: {
    user_id: string;
    name: string;
    email: string;
  };
  created_at: string;
  reason: string | null;
  reason_code: string | null;
  notes: string | null;
  reference_id: string | null;
  reference_no: string | null;
  reverses_movement_id: string | null;
};

type Page = {
  items: Movement[];
  total: number;
  page: number;
  pageSize: number;
};

type Detail = {
  movement: Movement;
  linked: Movement[];
};

type Filters = {
  product_id: string;
  location_id: string;
  user_id: string;
  reference_id: string;
  movement_type: string[];
  from: string;
  to: string;
};

const TYPE_OPTIONS = [
  ['RECEIPT', 'Receipt'],
  ['SALE', 'Sale'],
  ['CUSTOMER_RETURN', 'Return'],
  ['WRITE_OFF', 'Write-off'],
  ['ADJUSTMENT', 'Adjustment'],
  ['TRANSFER_OUT', 'Transfer out'],
  ['TRANSFER_IN', 'Transfer in'],
  ['COUNT_VARIANCE', 'Count variance'],
  ['COUNT', 'Legacy count'],
  ['IN', 'Legacy receipt'],
  ['OUT', 'Legacy issue'],
] as const;

const URL = `${(
  import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
).replace(/\/$/, '')}/api/stock-movements`;

const types = new Map<string, string>(TYPE_OPTIONS);

const typeLabel = (t: string) =>
  types.get(t) ?? t.replace(/_/g, ' ').toLowerCase();

const field: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  minWidth: 0,
};

const control: CSSProperties = {
  width: '100%',
  minWidth: 0,
};

const number: CSSProperties = {
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

const formatDate = (s: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(s));

const signed = (s: string) =>
  Number(s) > 0 ? `+${s}` : s;

const isObject = (
  v: unknown,
): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v);

const isMovement = (v: unknown): v is Movement =>
  isObject(v) &&
  typeof v.movement_id === 'string' &&
  typeof v.movement_no === 'string' &&
  typeof v.quantity_after === 'string' &&
  typeof v.quantity_change === 'string' &&
  isObject(v.product) &&
  isObject(v.user) &&
  isObject(v.location);

function fromQuery(p: URLSearchParams): Filters {
  return {
    product_id: p.get('product_id') ?? '',
    location_id: p.get('location_id') ?? '',
    user_id: p.get('user_id') ?? '',
    reference_id: p.get('reference_id') ?? '',
    movement_type: (p.get('movement_type') ?? '')
      .split(',')
      .filter(Boolean),
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
  };
}

function localDateBoundary(
  value: string,
  end: boolean,
): string {
  const [year, month, day] = value.split('-').map(Number);

  const date = end
    ? new Date(year, month - 1, day + 1)
    : new Date(year, month - 1, day);

  if (end) {
    date.setMilliseconds(date.getMilliseconds() - 1);
  }

  return date.toISOString();
}

function apiParams(
  filters: Filters,
  page: number,
  pageSize: number,
): URLSearchParams {
  const p = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (filters.product_id) {
    p.set('product_id', filters.product_id);
  }

  if (filters.location_id) {
    p.set('location_id', filters.location_id);
  }

  if (filters.user_id) {
    p.set('user_id', filters.user_id);
  }
  if (filters.reference_id) {
    p.set('reference_id', filters.reference_id);
  }

  if (filters.movement_type.length) {
    p.set('movement_type', filters.movement_type.join(','));
  }

  if (filters.from) {
    p.set('from', localDateBoundary(filters.from, false));
  }

  if (filters.to) {
    p.set('to', localDateBoundary(filters.to, true));
  }

  return p;
}

async function json(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (
    !(response.headers.get('content-type') ?? '')
      .includes('application/json')
  ) {
    throw new Error(
      'The server did not return JSON. Check API routing.',
    );
  }

  const body: unknown = await response.json();

  if (!response.ok) {
    throw new Error(
      isObject(body) && typeof body.error === 'string'
        ? body.error
        : `Request failed (HTTP ${response.status})`,
    );
  }

  return body;
}

function parsePage(value: unknown): Page {
  if (
    !isObject(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(isMovement) ||
    typeof value.total !== 'number' ||
    !Number.isSafeInteger(value.total) ||
    typeof value.page !== 'number' ||
    typeof value.pageSize !== 'number'
  ) {
    throw new Error('Unexpected movement history response.');
  }

  return value as Page;
}

function parseDetail(value: unknown): Detail {
  if (
    !isObject(value) ||
    !isMovement(value.movement) ||
    !Array.isArray(value.linked) ||
    !value.linked.every(isMovement)
  ) {
    throw new Error('Unexpected movement details response.');
  }

  return value as Detail;
}

function ProductLink({
  product,
}: {
  product: Movement['product'];
}) {
  return (
    <Link
      to={`/products/${encodeURIComponent(product.product_id)}`}
      className="table-link"
    >
      {product.name}
    </Link>
  );
}

export default function StockMovementHistory() {
  const [params, setParams] = useSearchParams();
  const key = params.toString();

  const filters = useMemo(
    () => fromQuery(new URLSearchParams(key)),
    [key],
  );

  const page = Math.max(1, Number(params.get('page')) || 1);

  const pageSize = [10, 20, 50, 100].includes(
    Number(params.get('pageSize')),
  )
    ? Number(params.get('pageSize'))
    : 50;

  const [applied, setApplied] = useState<Filters>(filters);
  const [result, setResult] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [actors, setActors] = useState<
    { user_id: string; name: string }[]
  >([]);

  const [optionsError, setOptionsError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const invalidRange = Boolean(
    filters.from && filters.to && filters.from > filters.to,
  );

  const hasFilters = Boolean(
    filters.from ||
      filters.to ||
      filters.product_id ||
      filters.location_id ||
      filters.user_id ||
      filters.reference_id ||
      filters.movement_type.length,
  );

  const update = useCallback(
    (field: string, value: string) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);

          if (value) {
            next.set(field, value);
          } else {
            next.delete(field);
          }

          if (field !== 'page') {
            next.delete('page');
          }

          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    const id = window.setTimeout(
      () => setApplied(filters),
      350,
    );

    return () => window.clearTimeout(id);
  }, [filters]);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      getProducts(),
      getLocations(),
      json(`${URL}/actors`),
    ]).then(([p, l, a]) => {
      if (!active) return;

      if (p.status === 'fulfilled') {
        setProducts(p.value);
      }

      if (l.status === 'fulfilled') {
        setLocations(l.value);
      }

      if (
        a.status === 'fulfilled' &&
        isObject(a.value) &&
        Array.isArray(a.value.items)
      ) {
        setActors(
          a.value.items.filter(
            (
              v,
            ): v is {
              user_id: string;
              name: string;
            } =>
              isObject(v) &&
              typeof v.user_id === 'string' &&
              typeof v.name === 'string',
          ),
        );
      }

      if (
        p.status === 'rejected' ||
        l.status === 'rejected' ||
        a.status === 'rejected'
      ) {
        setOptionsError(
          'Some filter choices could not be loaded.',
        );
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (invalidRange || filters !== applied) return;

    const abort = new AbortController();

    async function loadMovements() {
      await Promise.resolve();

      if (abort.signal.aborted) return;

      setLoading(true);
      setError('');

      try {
        const value = await json(
          `${URL}?${apiParams(applied, page, pageSize)}`,
          abort.signal,
        );

        if (!abort.signal.aborted) {
          setResult(parsePage(value));
        }
      } catch (e: unknown) {
        if (!abort.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : 'Failed to load movements.',
          );
        }
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadMovements();

    return () => abort.abort();
  }, [
    applied,
    page,
    pageSize,
    reload,
    invalidRange,
    filters,
  ]);

  // FIX: Capture the non-null ID before entering the async function.
  useEffect(() => {
    if (!selectedId) return;

    const movementId = selectedId;
    const abort = new AbortController();

    async function loadMovementDetails() {
      await Promise.resolve();

      if (abort.signal.aborted) return;

      setDetail(null);
      setDetailError('');
      setDetailLoading(true);

      try {
        const value = await json(
          `${URL}/${encodeURIComponent(movementId)}`,
          abort.signal,
        );

        if (!abort.signal.aborted) {
          setDetail(parseDetail(value));
        }
      } catch (e: unknown) {
        if (!abort.signal.aborted) {
          setDetailError(
            e instanceof Error
              ? e.message
              : 'Unable to load movement.',
          );
        }
      } finally {
        if (!abort.signal.aborted) {
          setDetailLoading(false);
        }
      }
    }

    void loadMovementDetails();

    return () => abort.abort();
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) {
      closeRef.current?.focus();
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedId(null);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [selectedId]);

  async function exportCsv() {
    setExporting(true);
    setExportError('');

    try {
      const response = await fetch(
        `${URL}/export.csv?${apiParams(applied, 1, 50)}`,
        {
          credentials: 'include',
          cache: 'no-store',
        },
      );

      if (!response.ok) {
        const data: unknown = await response.json().catch(() => null);

        throw new Error(
          isObject(data) && typeof data.error === 'string'
            ? data.error
            : `Export failed (HTTP ${response.status}).`,
        );
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'stock-movements.csv';
      link.click();

      window.setTimeout(
        () => window.URL.revokeObjectURL(objectUrl),
        1000,
      );
    } catch (e) {
      setExportError(
        e instanceof Error ? e.message : 'Export failed.',
      );
    } finally {
      setExporting(false);
    }
  }

  function open(
    id: string,
    button?: HTMLButtonElement,
  ) {
    if (button) {
      triggerRef.current = button;
    }

    setSelectedId(id);
  }

  function close() {
    setSelectedId(null);
    triggerRef.current?.focus();
  }

  const totalPages = Math.max(
    1,
    Math.ceil((result?.total ?? 0) / pageSize),
  );

  const rows = result?.items ?? [];

  return (
    <AppLayout>
      <PageHeader
        title="Movement Ledger"
        subtitle="Every stock change, its reason and the resulting balance."
      />

      <section
        className="card"
        aria-label="Movement filters"
        style={{
          padding: 'var(--space-4)',
          marginTop: 'var(--space-4)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit,minmax(min(100%,190px),1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <label style={field}>
            Product
            <select
              className="field-input"
              style={control}
              value={filters.product_id}
              onChange={(e) =>
                update('product_id', e.target.value)
              }
            >
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </label>

          <label style={field}>
            Location
            <select
              className="field-input"
              style={control}
              value={filters.location_id}
              onChange={(e) =>
                update('location_id', e.target.value)
              }
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.location_id} value={l.location_id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </label>

          <label style={field}>
            Recorded by
            <select
              className="field-input"
              style={control}
              value={filters.user_id}
              onChange={(e) =>
                update('user_id', e.target.value)
              }
            >
              <option value="">All users</option>
              {actors.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label style={field}>
            From date
            <input
              className="field-input"
              style={control}
              type="date"
              value={filters.from}
              onChange={(e) => update('from', e.target.value)}
              max={filters.to || undefined}
            />
          </label>

          <label style={field}>
            To date
            <input
              className="field-input"
              style={control}
              type="date"
              value={filters.to}
              onChange={(e) => update('to', e.target.value)}
              min={filters.from || undefined}
            />
          </label>
        </div>

        <fieldset
          style={{
            border: 0,
            margin: 'var(--space-3) 0 0',
            padding: 0,
          }}
        >
          <legend>Movement types</legend>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.65rem',
              marginTop: '0.5rem',
            }}
          >
            {TYPE_OPTIONS.map(([value, label]) => (
              <label
                key={value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  type="checkbox"
                  checked={filters.movement_type.includes(value)}
                  onChange={(e) =>
                    update(
                      'movement_type',
                      e.target.checked
                        ? [
                            ...filters.movement_type,
                            value,
                          ].join(',')
                        : filters.movement_type
                            .filter((v) => v !== value)
                            .join(','),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {invalidRange && (
          <p role="alert">
            The end date cannot precede the start date.
          </p>
        )}

        {optionsError && <p role="status">{optionsError}</p>}

        <div
          style={{
            display: 'flex',
            gap: '0.7rem',
            flexWrap: 'wrap',
            marginTop: 'var(--space-3)',
          }}
        >
          {filters.reference_id && <p role="status">Showing movements for linked document. Use Clear filters to return to all movements.</p>}
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!hasFilters}
            onClick={() =>
              setParams(
                new URLSearchParams({
                  pageSize: String(pageSize),
                }),
              )
            }
          >
            Clear filters
          </button>

          <button
            className="btn btn-secondary"
            type="button"
            disabled={exporting || loading || invalidRange}
            onClick={exportCsv}
          >
            {exporting ? 'Exporting...' : 'Export filtered CSV'}
          </button>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setReload((v) => v + 1)}
          >
            Refresh
          </button>
        </div>

        {exportError && <p role="alert">{exportError}</p>}
      </section>

      <section
        aria-label="Movement results"
        style={{ marginTop: 'var(--space-4)' }}
      >
        {loading ? (
          <p role="status">Loading movement ledger...</p>
        ) : error ? (
          <div role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setReload((v) => v + 1)}
            >
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p role="status">
            {hasFilters
              ? 'Nothing matches these filters. Clear filters to see the full history.'
              : 'No movements have been recorded yet.'}
          </p>
        ) : (
          <>
            <p role="status">
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, result?.total ?? 0)} of{' '}
              {result?.total} movements. Select a movement to inspect it.
            </p>

            <div
              className="table-wrap"
              style={{
                maxWidth: '100%',
                overflowX: 'auto',
              }}
            >
              <table className="data-table">
                <thead>
                  <tr>
                    {[
                      'When',
                      'Movement / reference',
                      'Type',
                      'Product',
                      'Location(s)',
                      'Reason',
                      'Who',
                      'Change',
                      'Balance after',
                      'Details',
                    ].map((h) => (
                      <th scope="col" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((m) => (
                    <tr key={m.movement_id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {formatDate(m.created_at)}
                      </td>

                      <td>
                        <span className="mono">{m.movement_no}</span>
                        <div>{m.reference_no ?? '—'}</div>
                      </td>

                      <td>{typeLabel(m.movement_type)}</td>

                      <td>
                        <ProductLink product={m.product} />
                        <div className="mono">{m.product.sku}</div>
                      </td>

                      <td>
                        {m.location.name}
                        {m.second_location && (
                          <div>↔ {m.second_location.name}</div>
                        )}
                      </td>

                      <td>
                        {m.reason_code ?? m.reason ?? '—'}
                      </td>

                      <td>{m.user.name}</td>

                      <td
                        style={{
                          ...number,
                          color:
                            Number(m.quantity_change) < 0
                              ? '#be123c'
                              : '#047857',
                        }}
                      >
                        {signed(m.quantity_change)}
                      </td>

                      <td style={number} className="mono">
                        {m.quantity_after}
                      </td>

                      <td>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={(e) =>
                            open(m.movement_id, e.currentTarget)
                          }
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && !error && result && result.total > 0 && (
          <nav
            aria-label="Movement pagination"
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-4)',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => update('page', String(page - 1))}
            >
              Previous
            </button>

            <span>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => update('page', String(page + 1))}
            >
              Next
            </button>

            <label>
              Rows per page{' '}
              <select
                className="field-input"
                value={pageSize}
                onChange={(e) =>
                  setParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set('pageSize', e.target.value);
                    next.delete('page');
                    return next;
                  })
                }
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </nav>
        )}
      </section>

      {selectedId && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={close}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Movement details"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(100%,530px)',
              overflowY: 'auto',
              background: 'var(--color-surface, white)',
              color: 'var(--color-text, #0f172a)',
              padding: '1.5rem',
              boxShadow: '0 0 24px rgba(0,0,0,.2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <h2>Movement details</h2>

              <button
                ref={closeRef}
                type="button"
                className="btn btn-secondary"
                onClick={close}
                aria-label="Close movement details"
              >
                Close
              </button>
            </div>

            {detailLoading ? (
              <p role="status">Loading movement...</p>
            ) : detailError ? (
              <p role="alert">{detailError}</p>
            ) : detail ? (
              <>
                <h3>
                  {detail.movement.movement_no} ·{' '}
                  {typeLabel(detail.movement.movement_type)}
                </h3>

                <dl
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(90px, 140px) 1fr',
                    gap: '0.6rem',
                  }}
                >
                  <div style={{ display: 'contents' }}>
                    <dt style={{ fontWeight: 600 }}>Product</dt>
                    <dd style={{ margin: 0 }}>
                      <ProductLink product={detail.movement.product} />
                      <div className="mono">
                        {detail.movement.product.sku}
                      </div>
                    </dd>
                  </div>

                  {(
                    [
                      [
                        'Date',
                        formatDate(detail.movement.created_at),
                      ],
                      ['Location', detail.movement.location.name],
                      [
                        'Other location',
                        detail.movement.second_location?.name ?? '—',
                      ],
                      ['Before', detail.movement.quantity_before],
                      [
                        'Change',
                        signed(detail.movement.quantity_change),
                      ],
                      ['After', detail.movement.quantity_after],
                      ['Recorded by', detail.movement.user.name],
                      [
                        'Reason',
                        detail.movement.reason_code ??
                          detail.movement.reason ??
                          '—',
                      ],
                      [
                        'Reference',
                        String(
                          detail.movement.reference_no ??
                            detail.movement.reference_id ??
                            '—',
                        ),
                      ],
                      ['Note', detail.movement.notes ?? '—'],
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      style={{ display: 'contents' }}
                    >
                      <dt style={{ fontWeight: 600 }}>{label}</dt>
                      <dd
                        style={{
                          margin: 0,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {detail.movement.movement_type === 'RECEIPT' &&
                 detail.movement.reference_no?.startsWith('GRN-') &&
                 detail.movement.reference_id && (
                  <p><Link to={`/receiving/${encodeURIComponent(detail.movement.reference_id)}`}>
                    Open goods-received note {detail.movement.reference_no}
                  </Link></p>
                )}
                <h3>
                  Related movements ({detail.linked.length})
                </h3>

                {detail.linked.length ? (
                  <ul>
                    {detail.linked.map((m) => (
                      <li
                        key={m.movement_id}
                        style={{ marginBottom: '0.65rem' }}
                      >
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() =>
                            setSelectedId(m.movement_id)
                          }
                        >
                          {m.movement_no} ·{' '}
                          {typeLabel(m.movement_type)} ·{' '}
                          {signed(m.quantity_change)} ·{' '}
                          {m.location.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No other movements with this reference.</p>
                )}

                <p style={{ fontSize: '0.85rem' }}>
                  This audit record is read-only. Corrections must
                  be posted as separate reversal movements, not
                  edits or deletions.
                </p>
              </>
            ) : null}
          </aside>
        </div>
      )}
    </AppLayout>
  );
}
