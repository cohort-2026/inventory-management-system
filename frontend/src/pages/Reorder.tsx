
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Badge from "../components/Badge";

type ReorderItem = {
  product_id: string;
  product_name: string;
  sku: string;
  location_id: string;
  location_name: string;
  on_hand: string;
  min_quantity: string;
  max_quantity: string;
  recommended_quantity: string;
  source_location_id: string | null;
  source_location_name: string | null;
  source_on_hand: string | null;
  source_available_quantity: string | null;
  suggested_source: string;
};

type ReorderResponse = {
  count: number;
  reorder_items: ReorderItem[];
};

const BASE = `${
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
}/api`;

function numberValue(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: string | null | undefined): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

function rowKey(item: ReorderItem): string {
  return `${item.product_id}:${item.location_id}`;
}

function csvValue(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export default function Reorder() {
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadReorderItems() {
      setLoading(true);
      setError("");
      setActionMessage("");
      setActionError("");

      try {
        const response = await fetch(`${BASE}/reorder`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          const body: { error?: string } = await response
            .json()
            .catch(() => ({}));

          throw new Error(
            body.error ??
              `Unable to load replenishment list (HTTP ${response.status}).`,
          );
        }

        const data = (await response.json()) as ReorderResponse;

        if (!Array.isArray(data.reorder_items)) {
          throw new Error("Invalid replenishment API response.");
        }

        if (!controller.signal.aborted) {
          setItems(data.reorder_items);
          setSelected([]);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setItems([]);
        setSelected([]);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load replenishment recommendations.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadReorderItems();

    return () => controller.abort();
  }, [revision]);

  const locations = useMemo(() => {
    return Array.from(
      new Map(
        items.map((item) => [
          item.location_id,
          item.location_name,
        ]),
      ),
      ([id, name]) => ({ id, name }),
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !term ||
        item.product_name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        item.location_name.toLowerCase().includes(term) ||
        (item.source_location_name ?? "")
          .toLowerCase()
          .includes(term);

      const matchesLocation =
        !locationFilter || item.location_id === locationFilter;

      return matchesSearch && matchesLocation;
    });
  }, [items, search, locationFilter]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ReorderItem[]>();

    filteredItems.forEach((item) => {
      const existing = groups.get(item.location_id) ?? [];
      existing.push(item);
      groups.set(item.location_id, existing);
    });

    return Array.from(groups.entries()).map(
      ([locationId, rows]) => ({
        locationId,
        locationName: rows[0]?.location_name ?? "Unknown location",
        rows,
      }),
    );
  }, [filteredItems]);

  const selectedItems = items.filter((item) =>
    selected.includes(rowKey(item)),
  );

  const allVisibleSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) =>
      selected.includes(rowKey(item)),
    );

  const totalRecommended = filteredItems.reduce(
    (total, item) =>
      total + numberValue(item.recommended_quantity),
    0,
  );

  function toggleItem(item: ReorderItem, checked: boolean) {
    const key = rowKey(item);

    setSelected((current) =>
      checked
        ? [...new Set([...current, key])]
        : current.filter((value) => value !== key),
    );
  }

  function toggleAllVisible(checked: boolean) {
    const visibleKeys = filteredItems.map(rowKey);

    setSelected((current) =>
      checked
        ? [...new Set([...current, ...visibleKeys])]
        : current.filter((key) => !visibleKeys.includes(key)),
    );
  }

  function exportCsv(selectedOnly: boolean) {
    setActionError("");
    setActionMessage("");

    const rows = selectedOnly ? selectedItems : filteredItems;

    if (rows.length === 0) {
      setActionError("There are no replenishment items to export.");
      return;
    }

    const headers = [
      "Product",
      "SKU",
      "Location",
      "On hand",
      "Minimum",
      "Maximum",
      "Recommended quantity",
      "Suggested source",
      "Source location",
      "Source available quantity",
    ];

    const csvRows = rows.map((item) =>
      [
        item.product_name,
        item.sku,
        item.location_name,
        item.on_hand,
        item.min_quantity,
        item.max_quantity,
        item.recommended_quantity,
        item.suggested_source,
        item.source_location_name ?? "",
        item.source_available_quantity ?? "",
      ]
        .map(csvValue)
        .join(","),
    );

    const csv = [
      headers.map(csvValue).join(","),
      ...csvRows,
    ].join("\r\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "replenishment-list.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    setActionMessage(
      `Exported ${rows.length} replenishment item(s).`,
    );
  }

  async function copySelected() {
    setActionError("");
    setActionMessage("");

    if (selectedItems.length === 0) {
      setActionError("Select at least one item to copy.");
      return;
    }

    const lines = [
      "REPLENISHMENT LIST",
      "",
      ...selectedItems.map((item) => {
        const source = item.source_location_name
          ? `${item.source_location_name} (${formatQuantity(item.source_available_quantity)} available)`
          : "Supplier required";

        return [
          `Product: ${item.product_name}`,
          `SKU: ${item.sku}`,
          `Location: ${item.location_name}`,
          `On hand: ${formatQuantity(item.on_hand)}`,
          `Minimum: ${formatQuantity(item.min_quantity)}`,
          `Maximum: ${formatQuantity(item.max_quantity)}`,
          `Recommended quantity: ${formatQuantity(item.recommended_quantity)}`,
          `Source: ${source}`,
        ].join("\n");
      }),
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n\n"));

      setActionMessage(
        `Copied ${selectedItems.length} item(s) to clipboard.`,
      );
    } catch {
      setActionError(
        "Unable to copy. Your browser may require a secure connection or clipboard permission.",
      );
    }
  }

  function sourceDisplay(item: ReorderItem) {
    if (!item.source_location_name) {
      return <Badge status="out">Supplier required</Badge>;
    }

    const available = numberValue(
      item.source_available_quantity,
    );

    const recommended = numberValue(
      item.recommended_quantity,
    );

    if (available < recommended) {
      return (
        <div>
          <Badge status="low">
            Insufficient transfer stock
          </Badge>
          <div className="text-muted">
            {item.source_location_name} ·{" "}
            {formatQuantity(item.source_available_quantity)} available
          </div>
        </div>
      );
    }

    return (
      <div>
        <Badge status="ok">Location transfer</Badge>
        <div>{item.source_location_name}</div>
        <div className="text-muted">
          {formatQuantity(item.source_available_quantity)} available
        </div>
      </div>
    );
  }

  function canTransfer(item: ReorderItem): boolean {
    return Boolean(
      item.source_location_id &&
        numberValue(item.recommended_quantity) > 0 &&
        numberValue(item.source_available_quantity) >=
          numberValue(item.recommended_quantity),
    );
  }

  function transferUrl(item: ReorderItem): string {
    const params = new URLSearchParams({
      product_id: item.product_id,
      from_location_id: item.source_location_id ?? "",
      to_location_id: item.location_id,
      quantity: item.recommended_quantity,
    });

    return `/transfer_stock?${params.toString()}`;
  }

  return (
    <AppLayout>
      <div className="enterprise-inventory">
        <PageHeader
          title="Replenishment"
          subtitle="Review products below their minimum stock levels and plan replenishment by location."
          actions={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                setRevision((current) => current + 1)
              }
              disabled={loading}
            >
              Refresh
            </button>
          }
        />

        <div
          className="f04-summary"
          aria-label="Replenishment summary"
        >
          <div className="f04-summary-item">
            <span>Replenishment items</span>
            <strong>
              {loading ? "—" : filteredItems.length}
            </strong>
          </div>

          <div className="f04-summary-item">
            <span>Locations affected</span>
            <strong>
              {loading ? "—" : groupedItems.length}
            </strong>
          </div>

          <div className="f04-summary-item">
            <span>Total recommended units</span>
            <strong>
              {loading
                ? "—"
                : formatQuantity(String(totalRecommended))}
            </strong>
          </div>

          <div className="f04-summary-item">
            <span>Selected</span>
            <strong>{selectedItems.length}</strong>
          </div>
        </div>

        <div className="f04-filter-bar">
          <label>
            Search products or locations
            <input
              className="field-input"
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search product name, SKU or location"
            />
          </label>

          <label>
            Location
            <select
              className="field-input"
              value={locationFilter}
              onChange={(event) => {
                setLocationFilter(event.target.value);
                setSelected([]);
              }}
            >
              <option value="">All locations</option>

              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => exportCsv(false)}
            disabled={loading || filteredItems.length === 0}
          >
            Export filtered CSV
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => exportCsv(true)}
            disabled={loading || selectedItems.length === 0}
          >
            Export selected ({selectedItems.length})
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void copySelected()}
            disabled={loading || selectedItems.length === 0}
          >
            Copy selected
          </button>
        </div>

        {actionMessage && (
          <p role="status">{actionMessage}</p>
        )}

        {actionError && (
          <p role="alert">{actionError}</p>
        )}

        {loading && (
          <p role="status">
            Loading replenishment recommendations…
          </p>
        )}

        {error && (
          <p role="alert">
            {error}{" "}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setRevision((current) => current + 1)
              }
            >
              Retry
            </button>
          </p>
        )}

        {!loading && !error && (
          <>
            {filteredItems.length === 0 && (
              <p role="status">
                {items.length === 0
                  ? "There are currently no products requiring replenishment."
                  : "No replenishment items match your search or location filter."}
              </p>
            )}

            {filteredItems.length > 0 && (
              <>
                <div className="f04-select-all">
                  <label>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) =>
                        toggleAllVisible(event.target.checked)
                      }
                    />{" "}
                    Select all visible items
                  </label>
                </div>

                {groupedItems.map((group) => (
                  <section
                    className="f04-table enterprise-table-surface"
                    key={group.locationId}
                    aria-label={`Replenishment for ${group.locationName}`}
                  >
                    <div className="f04-location-tabs">
                      <h2>{group.locationName}</h2>
                      <span>
                        {group.rows.length} item(s) requiring replenishment
                      </span>
                    </div>

                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">Select</th>
                            <th scope="col">Product</th>
                            <th scope="col">SKU</th>
                            <th scope="col">On hand</th>
                            <th scope="col">Minimum</th>
                            <th scope="col">Maximum</th>
                            <th scope="col">Recommended</th>
                            <th scope="col">Suggested source</th>
                            <th scope="col">Action</th>
                          </tr>
                        </thead>

                        <tbody>
                          {group.rows.map((item) => (
                            <tr key={rowKey(item)}>
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${item.product_name} at ${item.location_name}`}
                                  checked={selected.includes(
                                    rowKey(item),
                                  )}
                                  onChange={(event) =>
                                    toggleItem(
                                      item,
                                      event.target.checked,
                                    )
                                  }
                                />
                              </td>

                              <td>
                                <Link
                                  className="table-link"
                                  to={`/products/${encodeURIComponent(item.product_id)}`}
                                >
                                  {item.product_name}
                                </Link>
                              </td>

                              <td>{item.sku}</td>
                              <td>{formatQuantity(item.on_hand)}</td>
                              <td>{formatQuantity(item.min_quantity)}</td>
                              <td>{formatQuantity(item.max_quantity)}</td>

                              <td>
                                <strong>
                                  {formatQuantity(
                                    item.recommended_quantity,
                                  )}
                                </strong>
                              </td>

                              <td>{sourceDisplay(item)}</td>

                              <td>
                                {canTransfer(item) ? (
                                  <Link
                                    className="btn btn-secondary btn-sm"
                                    to={transferUrl(item)}
                                  >
                                    Transfer stock
                                  </Link>
                                ) : (
                                  <span className="text-muted">
                                    Not available
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
