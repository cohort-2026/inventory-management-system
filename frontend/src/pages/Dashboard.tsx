
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

type LocationOption = {
  location_id: string;
  name: string;
  status: string;
};

type AttentionRow = {
  product_id: string;
  product_name: string;
  sku: string;
  location_id: string;
  location_name: string;
  quantity: number;
  reorder_level: number;
  suggested_quantity: number;
  stock_status: "OUT" | "LOW";
};

type MovementRow = {
  movement_id: string;
  movement_no: string;
  movement_type: string;
  product_id: string;
  product_name: string;
  sku: string;
  location_id: string;
  location_name: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  user_id: string;
  user_name: string;
  created_at: string;
};

type DashboardSummary = {
  active_lines: number;
  units_on_hand: number;
  low_stock: number;
  out_of_stock: number;
  movements_today: number;
  pending_counts: number;
  counts_to_review: number;
  needs_attention: AttentionRow[];
  recent_movements: MovementRow[];
  time_zone: string;
  generated_at: string;
};

const API_BASE_URL = `${
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
}/api`;

const formatQuantity = (value: number) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6,
  }).format(value);

const isObject = (
  value: unknown,
): value is RecordObject =>
  typeof value === "object" && value !== null;

async function getLocations(
  signal: AbortSignal,
): Promise<LocationOption[]> {
  const response = await fetch(`${API_BASE_URL}/locations`, {
    method: "GET",
    signal,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const contentType =
    response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("The locations API returned a non-JSON response.");
  }

  const data: unknown = await response.json();

  if (!response.ok) {
    throw new Error(
      isObject(data) && typeof data.error === "string"
        ? data.error
        : `Unable to load warehouses (HTTP ${response.status}).`,
    );
  }

  if (!isObject(data) || !Array.isArray(data.items)) {
    throw new Error("The locations API returned an unexpected response.");
  }

  return data.items.filter(
    (item): item is LocationOption =>
      isObject(item) &&
      typeof item.location_id === "string" &&
      typeof item.name === "string" &&
      typeof item.status === "string" &&
      item.status === "active",
  );
}

async function getDashboardSummary(
  signal: AbortSignal,
  locationId: string,
): Promise<DashboardSummary> {
  const params = new URLSearchParams();

  if (locationId) {
    params.set("location_id", locationId);
  }

  const query = params.toString();
  const url = `${API_BASE_URL}/dashboard/summary${
    query ? `?${query}` : ""
  }`;

  const response = await fetch(url, {
    method: "GET",
    signal,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const contentType =
    response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      "The API returned a non-JSON response. Check the dashboard API route.",
    );
  }

  const data: unknown = await response.json();

  if (!response.ok) {
    throw new Error(
      isObject(data) && typeof data.error === "string"
        ? data.error
        : `Dashboard request failed (HTTP ${response.status}).`,
    );
  }

  if (
    !isObject(data) ||
    typeof data.active_lines !== "number" ||
    typeof data.units_on_hand !== "number" ||
    typeof data.low_stock !== "number" ||
    typeof data.out_of_stock !== "number" ||
    typeof data.movements_today !== "number" ||
    typeof data.pending_counts !== "number" ||
    typeof data.counts_to_review !== "number" ||
    !Array.isArray(data.needs_attention) ||
    !Array.isArray(data.recent_movements) ||
    typeof data.generated_at !== "string"
  ) {
    throw new Error(
      "The dashboard API returned an unexpected response.",
    );
  }

  return data as unknown as DashboardSummary;
}

function greeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";

  return "Good evening";
}

function formatDate(
  value: string,
  timeZone = "Africa/Johannesburg",
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
}

function movementName(type: string): string {
  const names: Record<string, string> = {
    ADJUSTMENT: "Adjustment",
    ADJUST_IN: "Adjustment in",
    ADJUST_OUT: "Adjustment out",
    TRANSFER_IN: "Transfer in",
    TRANSFER_OUT: "Transfer out",
    COUNT: "Stock count",
    COUNT_VARIANCE: "Count variance",
    IN: "Stock in",
    OUT: "Stock out",
    RECEIPT: "Receipt",
    SALE: "Sale",
    CUSTOMER_RETURN: "Customer return",
    WRITE_OFF: "Write-off",
  };

  return (
    names[type] ??
    type.toLowerCase().replace(/_/g, " ")
  );
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return "—";

  return `${value > 0 ? "+" : ""}${formatQuantity(value)}`;
}

export default function Dashboard() {
  const { user } = useAuth();

  const role = user?.roleName ?? null;

  const canManageStock =
    role === "Manager" ||
    role === "Inventory Staff";

  const canChooseLocation =
    role === "Manager" ||
    role === "Viewer";

  const firstName =
    user?.firstName?.trim() ||
    user?.username ||
    "there";

  const [summary, setSummary] =
    useState<DashboardSummary | null>(null);

  const [locations, setLocations] =
    useState<LocationOption[]>([]);

  const [selectedLocationId, setSelectedLocationId] =
    useState("");

  const [locationsError, setLocationsError] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const [lastUpdated, setLastUpdated] =
    useState<string | null>(null);

  // Load active warehouse options for Managers and Viewers.
  useEffect(() => {
    if (!canChooseLocation) return;

    const controller = new AbortController();
    let active = true;

    getLocations(controller.signal)
      .then((result) => {
        if (!active) return;

        setLocations(result);
        setLocationsError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;

        if (
          reason instanceof Error &&
          reason.name === "AbortError"
        ) {
          return;
        }

        setLocationsError(
          reason instanceof Error
            ? reason.message
            : "Unable to load warehouse options.",
        );
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [canChooseLocation]);

  // Load dashboard data for the selected warehouse.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getDashboardSummary(
      controller.signal,
      canChooseLocation ? selectedLocationId : "",
    )
      .then((result) => {
        if (!active) return;

        setSummary(result);
        setLastUpdated(result.generated_at);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;

        if (
          reason instanceof Error &&
          reason.name === "AbortError"
        ) {
          return;
        }

        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load dashboard data.",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [revision, selectedLocationId, canChooseLocation]);

  function refresh() {
    if (loading) return;

    setLoading(true);
    setError("");
    setRevision((value) => value + 1);
  }

  function changeLocation(locationId: string) {
    if (locationId === selectedLocationId) return;

    setLoading(true);
    setError("");
    setSelectedLocationId(locationId);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        subtitle={`${greeting()}, ${firstName}. Here's your operational overview.`}
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {canChooseLocation && (
        <div
          style={{
            marginBottom: "var(--space-3)",
            maxWidth: "360px",
          }}
        >
          <label
            htmlFor="dashboard-location"
            style={{
              display: "block",
              marginBottom: "var(--space-1)",
              fontWeight: 600,
            }}
          >
            Warehouse
          </label>

          <select
            id="dashboard-location"
            value={selectedLocationId}
            onChange={(event) =>
              changeLocation(event.target.value)
            }
            disabled={loading || locations.length === 0}
            className="form-control"
            style={{
              width: "100%",
              minHeight: "42px",
            }}
          >
            <option value="">All warehouses</option>

            {locations.map((location) => (
              <option
                key={location.location_id}
                value={location.location_id}
              >
                {location.name}
              </option>
            ))}
          </select>

          {locationsError && (
            <p role="alert" style={{ marginTop: "var(--space-1)" }}>
              {locationsError}
            </p>
          )}
        </div>
      )}

      {!canChooseLocation && role === "Inventory Staff" && (
        <p
          style={{
            marginBottom: "var(--space-3)",
            fontSize: "0.875rem",
            opacity: 0.75,
          }}
        >
          Showing your assigned warehouse.
        </p>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          marginBottom: "var(--space-3)",
        }}
      >
        <span style={{ fontSize: "0.875rem", opacity: 0.75 }}>
          Operational summary
        </span>

        <span
          style={{ fontSize: "0.875rem", opacity: 0.75 }}
          aria-live="polite"
        >
          {lastUpdated
            ? `Last updated: ${formatDate(
                lastUpdated,
                summary?.time_zone,
              )}`
            : "Not yet updated"}
        </span>
      </div>

      <div
        className="stat-grid"
        aria-busy={loading}
      >
        <StatCard
          label="Units on hand"
          value={
            summary
              ? formatQuantity(summary.units_on_hand)
              : "—"
          }
        />

        <StatCard
          label="Low-stock lines"
          value={
            summary
              ? formatQuantity(summary.low_stock)
              : "—"
          }
        />

        <StatCard
          label="Out-of-stock lines"
          value={
            summary
              ? formatQuantity(summary.out_of_stock)
              : "—"
          }
        />

        <StatCard
          label="Counts to review"
          value={
            summary
              ? formatQuantity(summary.counts_to_review)
              : "—"
          }
        />

        <StatCard
          label="Movements today"
          value={
            summary
              ? formatQuantity(summary.movements_today)
              : "—"
          }
        />
      </div>

      <p
        style={{
          marginTop: "var(--space-2)",
          opacity: 0.75,
          fontSize: "0.875rem",
        }}
      >
        Stock figures are calculated across active product-location
        lines. Low-stock and out-of-stock figures count inventory
        lines, not unique products.
      </p>

      {loading && (
        <p role="status">
          Loading dashboard data...
        </p>
      )}

      {!loading && error && (
        <div role="alert">
          <p>Dashboard unavailable: {error}</p>

          <button
            className="btn btn-secondary"
            type="button"
            onClick={refresh}
          >
            Try again
          </button>
        </div>
      )}

      {!error && (
        <>
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              flexWrap: "wrap",
              margin: "var(--space-4) 0",
            }}
          >
            <Link
              to="/inventory_overview"
              className="btn btn-secondary"
            >
              View inventory
            </Link>

            {canManageStock && (
              <Link
                to="/inventory_count"
                className="btn btn-secondary"
              >
                Stock counts
              </Link>
            )}

            <Link
              to="/stock_movement_history"
              className="btn btn-secondary"
            >
              Movement history
            </Link>
          </div>

          <Card title="Needs Attention">
            {!loading &&
              summary &&
              summary.needs_attention.length === 0 && (
                <p role="status">
                  No low-stock or out-of-stock inventory
                  lines need attention.
                </p>
              )}

            {!loading &&
              summary &&
              summary.needs_attention.length > 0 && (
                <>
                  <div
                    className="table-wrap"
                    style={{ overflowX: "auto" }}
                  >
                    <DataTable
                      columns={[
                        {
                          header: "Product",
                          render: (row: AttentionRow) =>
                            row.product_name,
                        },
                        {
                          header: "SKU",
                          render: (row: AttentionRow) =>
                            row.sku,
                          mono: true,
                        },
                        {
                          header: "Location",
                          render: (row: AttentionRow) =>
                            row.location_name,
                        },
                        {
                          header: "Quantity",
                          render: (row: AttentionRow) =>
                            formatQuantity(row.quantity),
                          mono: true,
                        },
                        {
                          header: "Reorder level",
                          render: (row: AttentionRow) =>
                            formatQuantity(row.reorder_level),
                          mono: true,
                        },
                        {
                          header: "Suggested quantity",
                          render: (row: AttentionRow) =>
                            formatQuantity(
                              row.suggested_quantity,
                            ),
                          mono: true,
                        },
                        {
                          header: "Status",
                          render: (row: AttentionRow) => (
                            <Badge
                              status={
                                row.stock_status === "OUT"
                                  ? "out"
                                  : "low"
                              }
                            >
                              {row.stock_status === "OUT"
                                ? "OUT OF STOCK"
                                : "LOW STOCK"}
                            </Badge>
                          ),
                        },
                      ]}
                      rows={summary.needs_attention}
                      keyField={(row: AttentionRow) =>
                        `${row.product_id}:${row.location_id}`
                      }
                    />
                  </div>

                  <p
                    style={{
                      marginTop: "var(--space-2)",
                    }}
                  >
                    Suggested quantity indicates the amount
                    needed to reach the current reorder level.
                    {" "}
                    <Link to="/inventory_overview">
                      View inventory
                    </Link>
                  </p>
                </>
              )}
          </Card>

          <div style={{ marginTop: "var(--space-4)" }}>
            <Card title="Stock Counts Awaiting Review">
              {!loading && summary && (
                <>
                  <p>
                    <strong>
                      {formatQuantity(summary.counts_to_review)}
                    </strong>{" "}
                    count(s) are ready for review.
                  </p>

                  <p>
                    {formatQuantity(summary.pending_counts)}{" "}
                    count(s) are currently open.
                  </p>

                  {canManageStock && (
                    <Link
                      to="/inventory_count"
                      className="btn btn-secondary"
                    >
                      Review stock counts
                    </Link>
                  )}
                </>
              )}
            </Card>
          </div>

          <div style={{ marginTop: "var(--space-4)" }}>
            <Card title="Recent Stock Movements">
              {!loading &&
                summary &&
                summary.recent_movements.length === 0 && (
                  <p role="status">
                    No stock movements have been recorded yet.
                  </p>
                )}

              {!loading &&
                summary &&
                summary.recent_movements.length > 0 && (
                  <div
                    className="table-wrap"
                    style={{ overflowX: "auto" }}
                  >
                    <DataTable
                      columns={[
                        {
                          header: "Date & time",
                          render: (row: MovementRow) =>
                            formatDate(
                              row.created_at,
                              summary?.time_zone,
                            ),
                        },
                        {
                          header: "Movement",
                          render: (row: MovementRow) =>
                            movementName(row.movement_type),
                        },
                        {
                          header: "Product",
                          render: (row: MovementRow) =>
                            `${row.product_name} (${row.sku})`,
                        },
                        {
                          header: "Location",
                          render: (row: MovementRow) =>
                            row.location_name,
                        },
                        {
                          header: "Change",
                          render: (row: MovementRow) =>
                            formatSigned(row.quantity_change),
                          mono: true,
                        },
                        {
                          header: "Who",
                          render: (row: MovementRow) =>
                            row.user_name,
                        },
                      ]}
                      rows={summary.recent_movements}
                      keyField={(row: MovementRow) =>
                        row.movement_id
                      }
                    />
                  </div>
                )}

              <p style={{ marginTop: "var(--space-2)" }}>
                <Link to="/stock_movement_history">
                  Open complete stock movement history
                </Link>
              </p>
            </Card>
          </div>
        </>
      )}
    </AppLayout>
  );
}
