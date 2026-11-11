import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";
import { useAuth } from "../utils/AuthContext";

type RecordObject = Record<string, unknown>;
type InventoryRow = {
  inventory_id: string;
  product_id: string;
  name: string;
  sku: string;
  location_name: string;
  quantity: number;
  reorder_level: number;
  stock_status: "LOW_STOCK" | "OUT_OF_STOCK" | "IN_STOCK";
};
type MovementRow = {
  movement_id: string;
  created_at: string;
  movement_type: string;
  product: { name: string; sku: string };
  location: { name: string };
  second_location: { name: string } | null;
  quantity_change: string;
  user: { name: string };
  notes: string | null;
  reason: string | null;
};

type InventorySummary = {
  stockedProducts: number;
  totalUnits: number;
  lowStock: number;
  outOfStock: number;
  attention: InventoryRow[];
};

const API_BASE_URL = `${import.meta.env.VITE_API_URL ?? "http://localhost:5000"}/api`;
const formatQuantity = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
const isObject = (value: unknown): value is RecordObject => typeof value === "object" && value !== null;

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal,
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The API returned a non-JSON response. Check the deployed API route.");
  }
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(isObject(data) && typeof data.error === "string" ? data.error : `Request failed (HTTP ${response.status}).`);
  }
  return data;
}

function parseInventoryRow(value: unknown): InventoryRow {
  if (!isObject(value) || typeof value.inventory_id !== "string" || typeof value.product_id !== "string" ||
      typeof value.name !== "string" || typeof value.sku !== "string" || typeof value.location_name !== "string" ||
      !["LOW_STOCK", "OUT_OF_STOCK", "IN_STOCK"].includes(String(value.stock_status))) {
    throw new Error("The inventory API returned an unexpected record.");
  }
  const quantity = Number(value.quantity);
  const reorderLevel = Number(value.reorder_level);
  if (value.quantity == null || value.reorder_level == null || !Number.isFinite(quantity) || !Number.isFinite(reorderLevel)) {
    throw new Error("The inventory API returned an invalid quantity.");
  }
  return {
    inventory_id: value.inventory_id,
    product_id: value.product_id,
    name: value.name,
    sku: value.sku,
    location_name: value.location_name,
    quantity,
    reorder_level: reorderLevel,
    stock_status: value.stock_status as InventoryRow["stock_status"],
  };
}

async function fetchInventorySummary(signal: AbortSignal): Promise<InventorySummary> {
  const pageSize = 100;
  const rows: InventoryRow[] = [];
  let total = -1;
  // Fetch the entire paginated inventory; never present page-one numbers as overall KPIs.
  for (let page = 1; page <= 1000; page += 1) {
    const data = await getJson(`/inventory?page=${page}&pageSize=${pageSize}`, signal);
    if (!isObject(data) || !Array.isArray(data.items) || typeof data.total !== "number" || !Number.isSafeInteger(data.total) || data.total < 0) {
      throw new Error("The inventory API returned an unexpected page.");
    }
    if (total !== -1 && total !== data.total) {
      throw new Error("Inventory changed while the dashboard loaded. Refresh to get a consistent summary.");
    }
    total = data.total;
    rows.push(...data.items.map(parseInventoryRow));
    if (rows.length >= total) {
      const attention = rows.filter(row => row.stock_status !== "IN_STOCK")
        .sort((a, b) => Number(a.stock_status === "LOW_STOCK") - Number(b.stock_status === "LOW_STOCK") || a.name.localeCompare(b.name));
      return {
        stockedProducts: new Set(rows.map(row => row.product_id)).size,
        totalUnits: rows.reduce((sum, row) => sum + row.quantity, 0),
        lowStock: rows.filter(row => row.stock_status === "LOW_STOCK").length,
        outOfStock: rows.filter(row => row.stock_status === "OUT_OF_STOCK").length,
        attention: attention.slice(0, 10),
      };
    }
    if (data.items.length === 0) throw new Error("Inventory pagination ended unexpectedly.");
  }
  throw new Error("Too many inventory pages to summarize in the browser.");
}

function parseMovementRow(value: unknown): MovementRow {
  if (!isObject(value) || typeof value.movement_id !== "string" || typeof value.created_at !== "string" ||
      typeof value.movement_type !== "string" || typeof value.quantity_change !== "string" ||
      !isObject(value.product) || typeof value.product.name !== "string" || typeof value.product.sku !== "string" ||
      !isObject(value.location) || typeof value.location.name !== "string" ||
      !isObject(value.user) || typeof value.user.name !== "string" ||
      (value.second_location != null && (!isObject(value.second_location) || typeof value.second_location.name !== "string"))) {
    throw new Error("The movements API returned an unexpected record.");
  }
  return {
    movement_id: value.movement_id,
    created_at: value.created_at,
    movement_type: value.movement_type,
    quantity_change: value.quantity_change,
    product: { name: value.product.name, sku: value.product.sku },
    location: { name: value.location.name },
    second_location: value.second_location ? { name: (value.second_location as RecordObject).name as string } : null,
    user: { name: value.user.name },
    notes: typeof value.notes === "string" ? value.notes : null,
    reason: typeof value.reason === "string" ? value.reason : null,
  };
}

async function fetchRecentMovements(signal: AbortSignal): Promise<MovementRow[]> {
  const data = await getJson("/stock-movements?page=1&pageSize=8", signal);
  if (!isObject(data) || !Array.isArray(data.items)) throw new Error("The movements API returned an unexpected response.");
  return data.items.map(parseMovementRow);
}

function movementName(type: string): string {
  const names: Record<string, string> = {
    ADJUSTMENT: "Adjustment", ADJUST_IN: "Adjustment in", ADJUST_OUT: "Adjustment out",
    TRANSFER_IN: "Transfer in", TRANSFER_OUT: "Transfer out", COUNT: "Stock count",
    IN: "Stock in", OUT: "Stock out", RECEIPT: "Receipt",
  };
  return names[type] ?? type.toLowerCase().replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
}

function formatSigned(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${number > 0 ? "+" : ""}${formatQuantity(number)}` : value;
}

function formatDate(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function Dashboard() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [inventoryError, setInventoryError] = useState("");
  const [movementError, setMovementError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.allSettled([
      fetchInventorySummary(controller.signal),
      fetchRecentMovements(controller.signal),
    ]).then(([inventoryResult, movementResult]) => {
      if (!active) return;
      if (inventoryResult.status === "fulfilled") {
        setInventory(inventoryResult.value);
        setInventoryError("");
      } else {
        setInventory(null);
        setInventoryError(inventoryResult.reason instanceof Error ? inventoryResult.reason.message : "Unable to load inventory summary.");
      }
      if (movementResult.status === "fulfilled") {
        setMovements(movementResult.value);
        setMovementError("");
      } else {
        setMovements([]);
        setMovementError(movementResult.reason instanceof Error ? movementResult.reason.message : "Unable to load recent movements.");
      }
      setLoading(false);
    });
    return () => { active = false; controller.abort(); };
  }, [revision]);

  function refresh() {
    if (loading) return;
    setLoading(true);
    setRevision(value => value + 1);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        subtitle={`Inventory overview${user?.username ? ` · ${user.username}` : ""}`}
        actions={<button className="btn btn-secondary" type="button" onClick={refresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>}
      />

      <div className="stat-grid" aria-busy={loading}>
        <StatCard label="Stocked products" value={inventory ? formatQuantity(inventory.stockedProducts) : "—"} />
        <StatCard label="Total stock units" value={inventory ? formatQuantity(inventory.totalUnits) : "—"} />
        <StatCard label="Low-stock entries" value={inventory ? formatQuantity(inventory.lowStock) : "—"} />
        <StatCard label="Out-of-stock entries" value={inventory ? formatQuantity(inventory.outOfStock) : "—"} />
      </div>
      <p style={{ marginTop: "var(--space-2)", opacity: 0.75, fontSize: "0.875rem" }}>
        Stock totals are summed across recorded product–location inventory entries. Low/out-of-stock figures count entries, not unique products.
      </p>
      {loading && <p role="status">Loading dashboard data...</p>}
      {!loading && inventoryError && <p role="alert">Inventory summary unavailable: {inventoryError}</p>}

      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", margin: "var(--space-4) 0" }}>
        <Link to="/inventory_overview" className="btn btn-secondary">View inventory</Link>
        <Link to="/stock_movement_history" className="btn btn-secondary">Full movement history</Link>
        <Link to="/inventory_count" className="btn btn-secondary">Stock counts</Link>
      </div>

      <Card title="Inventory Attention">
        {!loading && !inventoryError && inventory && inventory.attention.length === 0 &&
          <p role="status">No low-stock or out-of-stock inventory entries need attention.</p>}
        {!loading && !inventoryError && inventory && inventory.attention.length > 0 && (
          <div className="table-wrap" style={{ overflowX: "auto" }}>
            <DataTable
              columns={[
                { header: "Product", render: (row: InventoryRow) => row.name },
                { header: "SKU", render: (row: InventoryRow) => row.sku, mono: true },
                { header: "Location", render: (row: InventoryRow) => row.location_name },
                { header: "Quantity", render: (row: InventoryRow) => formatQuantity(row.quantity), mono: true },
                { header: "Reorder level", render: (row: InventoryRow) => formatQuantity(row.reorder_level), mono: true },
                { header: "Status", render: (row: InventoryRow) => <Badge status={row.stock_status === "OUT_OF_STOCK" ? "out" : "low"}>{row.stock_status === "OUT_OF_STOCK" ? "OUT OF STOCK" : "LOW STOCK"}</Badge> },
              ]}
              rows={inventory.attention}
              keyField={(row: InventoryRow) => row.inventory_id}
            />
          </div>
        )}
        {!loading && inventory && inventory.attention.length > 0 && <p style={{ marginTop: "var(--space-2)" }}>Showing up to 10 entries requiring attention. <Link to="/inventory_overview">See all inventory</Link>.</p>}
      </Card>

      <div style={{ marginTop: "var(--space-4)" }}>
        <Card title="Recent Stock Movements">
          {!loading && movementError && <p role="alert">Recent movements unavailable: {movementError}</p>}
          {!loading && !movementError && movements.length === 0 && <p role="status">No stock movements have been recorded yet.</p>}
          {!loading && !movementError && movements.length > 0 && (
            <div className="table-wrap" style={{ overflowX: "auto" }}>
              <DataTable
                columns={[
                  { header: "Date & time", render: (row: MovementRow) => formatDate(row.created_at) },
                  { header: "Type", render: (row: MovementRow) => movementName(row.movement_type) },
                  { header: "Product", render: (row: MovementRow) => `${row.product.name} (${row.product.sku})` },
                  { header: "Location(s)", render: (row: MovementRow) => row.second_location ? `${row.location.name} / ${row.second_location.name}` : row.location.name },
                  { header: "Change", render: (row: MovementRow) => formatSigned(row.quantity_change), mono: true },
                  { header: "Who", render: (row: MovementRow) => row.user.name },
                  { header: "Note", render: (row: MovementRow) => row.notes || row.reason || "—" },
                ]}
                rows={movements}
                keyField={(row: MovementRow) => row.movement_id}
              />
            </div>
          )}
          <p style={{ marginTop: "var(--space-2)" }}><Link to="/stock_movement_history">Open complete stock movement history</Link></p>
        </Card>
      </div>
    </AppLayout>
  );
}
