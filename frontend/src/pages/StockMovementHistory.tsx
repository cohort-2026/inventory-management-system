import { useEffect, useMemo, useState, type CSSProperties } from "react";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import { getLocations, getProducts, type LocationOption, type ProductOption } from "../services/api";

type Movement = {
  movement_id: string;
  movement_type: string;
  product: { product_id: string; name: string; sku: string };
  location: { location_id: string; name: string; code: string };
  second_location: { location_id: string; name: string; code: string } | null;
  quantity_change: string;
  user: { user_id: string; name: string; email: string };
  created_at: string;
  reason: string | null;
  notes: string | null;
};
type MovementPage = { items: Movement[]; total: number; page: number; pageSize: number };
type Filters = { productId: string; locationId: string; movementType: string; from: string; to: string };
const DEFAULT_FILTERS: Filters = { productId: "", locationId: "", movementType: "", from: "", to: "" };
const PAGE_SIZES = [10, 20, 50, 100] as const;
const MOVEMENT_TYPES = [
  { value: "ADJUSTMENT", label: "Adjustment" },
  { value: "TRANSFER_OUT", label: "Transfer out" },
  { value: "TRANSFER_IN", label: "Transfer in" },
  { value: "COUNT", label: "Stock count" },
  { value: "IN", label: "Stock received" },
  { value: "OUT", label: "Stock issued" },
] as const;
const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:5000").replace(/\/$/, "");

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isEntity(value: unknown, keys: string[]): boolean {
  return isRecord(value) && keys.every((key) => typeof value[key] === "string");
}
function isMovement(value: unknown): value is Movement {
  if (!isRecord(value)) return false;
  return (
    typeof value.movement_id === "string" &&
    typeof value.movement_type === "string" &&
    typeof value.created_at === "string" &&
    typeof value.quantity_change === "string" &&
    isEntity(value.product, ["product_id", "name", "sku"]) &&
    isEntity(value.location, ["location_id", "name", "code"]) &&
    (value.second_location === null || isEntity(value.second_location, ["location_id", "name", "code"])) &&
    isEntity(value.user, ["user_id", "name", "email"]) &&
    (value.reason === null || typeof value.reason === "string") &&
    (value.notes === null || typeof value.notes === "string")
  );
}
function formatMovementType(value: string): string {
  return MOVEMENT_TYPES.find((item) => item.value === value)?.label ??
    value.toLowerCase().replace(/_/g, " ").replace(/^./, (s) => s.toUpperCase());
}
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" :
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function formatChange(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number > 0 ? `+${value}` : value;
}
async function loadMovementPage(filters: Filters, page: number, pageSize: number, signal: AbortSignal): Promise<MovementPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.productId) params.set("product_id", filters.productId);
  if (filters.locationId) params.set("location_id", filters.locationId);
  if (filters.movementType) params.set("movement_type", filters.movementType);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const response = await fetch(`${BASE_URL}/api/stock-movements?${params.toString()}`, {
    credentials: "include", signal, headers: { Accept: "application/json" },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("The server returned HTML or another unexpected response instead of movement data.");
  }
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : `Unable to load movements (HTTP ${response.status}).`;
    if (response.status === 403) throw new Error(`Permission denied: ${message}`);
    throw new Error(message);
  }
  if (!isRecord(body) || !Array.isArray(body.items) || !body.items.every(isMovement) ||
      typeof body.total !== "number" || !Number.isSafeInteger(body.total) || body.total < 0 ||
      typeof body.page !== "number" || typeof body.pageSize !== "number") {
    throw new Error("The server returned an unexpected stock movement history response.");
  }
  return body as MovementPage;
}

const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.35rem", minWidth: 0 };
const inputStyle: CSSProperties = { width: "100%", minWidth: 0 };

export default function StockMovementHistory() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [result, setResult] = useState<MovementPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [optionsError, setOptionsError] = useState("");

  // Debounce filter changes. Requests already in flight are aborted by the effect below.
  useEffect(() => {
    const timeout = window.setTimeout(() => setAppliedFilters(filters), 350);
    return () => window.clearTimeout(timeout);
  }, [filters]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getProducts(), getLocations()]).then(([productResult, locationResult]) => {
      if (!active) return;
      if (productResult.status === "fulfilled") setProducts(productResult.value);
      if (locationResult.status === "fulfilled") setLocations(locationResult.value);
      if (productResult.status === "rejected" || locationResult.status === "rejected") {
        setOptionsError("Some filter choices could not be loaded. Movement history is still available.");
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (appliedFilters.from && appliedFilters.to && appliedFilters.from > appliedFilters.to) {
      return;
    }
    const controller = new AbortController();
    // Loading is set immediately for clarity; stale results are discarded on cleanup.
    loadMovementPage(appliedFilters, page, pageSize, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult(data);
        setError("");
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Unable to load movement history.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [appliedFilters, page, pageSize, reload]);

  function changeFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setLoading(true);
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  }
  function clearFilters() {
    setLoading(true);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setReload((value) => value + 1);
  }
  const hasFilters = useMemo(() => Object.values(appliedFilters).some(Boolean), [appliedFilters]);
  const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);
  const totalPages = result ? Math.max(1, Math.ceil(result.total / pageSize)) : 1;
  const rows = result?.items ?? [];

  return (
    <AppLayout>
      <PageHeader title="Stock Movement History" subtitle="Browse the audit trail of inventory movements." />
      <section className="card" aria-label="Movement filters" style={{ padding: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: "var(--space-3)" }}>
          <label style={fieldStyle}>Product
            <select className="field-input" style={inputStyle} value={filters.productId} onChange={(e) => changeFilter("productId", e.target.value)}>
              <option value="">All products</option>
              {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} ({p.sku})</option>)}
            </select>
          </label>
          <label style={fieldStyle}>Location
            <select className="field-input" style={inputStyle} value={filters.locationId} onChange={(e) => changeFilter("locationId", e.target.value)}>
              <option value="">All locations</option>
              {locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name} ({l.code})</option>)}
            </select>
          </label>
          <label style={fieldStyle}>Movement type
            <select className="field-input" style={inputStyle} value={filters.movementType} onChange={(e) => changeFilter("movementType", e.target.value)}>
              <option value="">All types</option>
              {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label style={fieldStyle}>From date
            <input className="field-input" style={inputStyle} type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => changeFilter("from", e.target.value)} aria-invalid={invalidRange} aria-describedby={invalidRange ? "movement-date-error" : undefined} />
          </label>
          <label style={fieldStyle}>To date
            <input className="field-input" style={inputStyle} type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => changeFilter("to", e.target.value)} aria-invalid={invalidRange} aria-describedby={invalidRange ? "movement-date-error" : undefined} />
          </label>
        </div>
        {invalidRange && <p id="movement-date-error" role="alert" className="locations-error">The end date must not be earlier than the start date.</p>}
        {optionsError && <p role="status">{optionsError}</p>}
        <div style={{ marginTop: "var(--space-3)" }}>
          <button type="button" className="btn btn-secondary" onClick={clearFilters} disabled={!Object.values(filters).some(Boolean) && !error}>Clear filters</button>
        </div>
      </section>

      <section aria-label="Movement results" style={{ marginTop: "var(--space-4)" }}>
        {loading ? <p role="status">Loading stock movements...</p> : error ? (
          <div role="alert"><p>{error}</p><button type="button" className="btn btn-secondary" onClick={() => { setLoading(true); setReload((v) => v + 1); }}>Try again</button></div>
        ) : rows.length === 0 ? (
          <p role="status">{hasFilters ? "No movements match the selected filters." : "No stock movements have been recorded yet."}</p>
        ) : (
          <>
            <p role="status">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, result?.total ?? 0)} of {result?.total ?? 0} movements</p>
            <div className="table-wrap" style={{ overflowX: "auto", maxWidth: "100%" }}>
              <table className="data-table">
                <thead><tr><th scope="col">Date & time</th><th scope="col">Type</th><th scope="col">Product</th><th scope="col">Location(s)</th><th scope="col">Quantity change</th><th scope="col">Who</th><th scope="col">Note</th></tr></thead>
                <tbody>{rows.map((m) => <tr key={m.movement_id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(m.created_at)}</td>
                  <td>{formatMovementType(m.movement_type)}</td>
                  <td>{m.product.name}<div className="mono">{m.product.sku}</div></td>
                  <td>{m.location.name}{m.second_location && <div>↔ {m.second_location.name}</div>}</td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{formatChange(m.quantity_change)}</td>
                  <td>{m.user.name}</td>
                  <td>{m.notes || m.reason || "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>
        )}
        {!loading && !error && result && result.total > 0 && (
          <nav aria-label="Movement history pagination" style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center", marginTop: "var(--space-4)" }}>
            <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => { setLoading(true); setPage((p) => Math.max(1, p - 1)); }}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => { setLoading(true); setPage((p) => Math.min(totalPages, p + 1)); }}>Next</button>
            <label>Rows per page <select className="field-input" value={pageSize} onChange={(e) => { setLoading(true); setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select></label>
          </nav>
        )}
      </section>
    </AppLayout>
  );
}
