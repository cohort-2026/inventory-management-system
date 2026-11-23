
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Archive,
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  Package,
  Pencil,
  RefreshCw,
  Warehouse,
} from "lucide-react";

import AppLayout from "../components/AppLayout";
import EditProductModal from "../components/EditProductModal";
import type { EditableProduct } from "../components/EditProductModal";
import type { ProductCategory } from "../components/ProductForm";
import { getProductDetails } from "../services/api";
import type {
  ProductDetailResponse,
  ProductRecentMovement,
} from "../services/api";
import { useAuth } from "../utils/AuthContext";

const API_BASE_URL = `${
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
}/api`;

type ReorderRule = {
  reorder_rule_id: string;
  product_id: string;
  location_id: string;
  location_name: string;
  min_quantity: string | number;
  max_quantity: string | number;
};

type ReorderRulesResponse = {
  product: {
    product_id: string;
    name: string;
    sku: string;
    reorder_level: string | number;
  };
  rules: ReorderRule[];
};

type ReorderRuleValues = {
  min: string;
  max: string;
};

function formatQuantity(value: string | number): string {
  const number = Number(value);

  if (!Number.isFinite(number)) return String(value);

  return number.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

function formatDate(value: string | null): string {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString();
}

function movementLabel(movement: ProductRecentMovement): string {
  return movement.movement_no
    ? `${movement.movement_no} - ${movement.movement_type}`
    : movement.movement_type;
}

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [details, setDetails] = useState<ProductDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [archiving, setArchiving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState("");

  const [reorderRules, setReorderRules] = useState<
    Record<string, ReorderRuleValues>
  >({});
  const [reorderRulesLoading, setReorderRulesLoading] = useState(false);
  const [reorderRulesError, setReorderRulesError] = useState("");
  const [savingRuleLocation, setSavingRuleLocation] = useState("");
  const [reorderRuleMessage, setReorderRuleMessage] = useState("");

  const isManager = user?.roleName === "Manager";

  const canManageStock =
    isManager || user?.roleName === "Inventory Staff";

  const loadProduct = useCallback(async () => {
    if (!id) {
      setError("A product ID was not provided.");
      setDetails(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await getProductDetails(id);
      setDetails(result);
    } catch (err) {
      setDetails(null);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load product details.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      if (!id) {
        setError("A product ID was not provided.");
        setDetails(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const result = await getProductDetails(id);

        if (!cancelled) {
          setDetails(result);
        }
      } catch (err) {
        if (!cancelled) {
          setDetails(null);
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load product details.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, retryCount]);

  useEffect(() => {
    if (!editing) return;

    const controller = new AbortController();

    async function loadCategories(): Promise<void> {
      setCategoriesLoading(true);
      setCategoriesError("");

      try {
        const response = await fetch(`${API_BASE_URL}/categories`, {
          credentials: "include",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "string"
              ? data.error
              : `Unable to load categories (HTTP ${response.status}).`;

          throw new Error(message);
        }

        if (
          typeof data !== "object" ||
          data === null ||
          !("items" in data) ||
          !Array.isArray(data.items)
        ) {
          throw new Error("Unexpected categories response.");
        }

        const validCategories = data.items.filter(
          (item): item is ProductCategory =>
            typeof item === "object" &&
            item !== null &&
            "category_id" in item &&
            typeof item.category_id === "string" &&
            "name" in item &&
            typeof item.name === "string",
        );

        if (!controller.signal.aborted) {
          setCategories(validCategories);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setCategoriesError(
            err instanceof Error ? err.message : "Unable to load categories.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setCategoriesLoading(false);
        }
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, [editing]);

  useEffect(() => {
    if (!id || !details) return;

    const productId = id;
    const currentDetails = details;
    const controller = new AbortController();

    async function loadReorderRules(): Promise<void> {
      setReorderRulesLoading(true);
      setReorderRulesError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/products/${encodeURIComponent(productId)}/reorder-rules`,
          {
            credentials: "include",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
            },
          },
        );

        const data: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "string"
              ? data.error
              : `Unable to load reorder rules (HTTP ${response.status}).`;

          throw new Error(message);
        }

        if (
          typeof data !== "object" ||
          data === null ||
          !("product" in data) ||
          !("rules" in data) ||
          !Array.isArray(data.rules)
        ) {
          throw new Error("Unexpected reorder rules response.");
        }

        const result = data as ReorderRulesResponse;
        const fallback = String(result.product.reorder_level ?? 0);

        const values: Record<string, ReorderRuleValues> = {};

        for (const location of currentDetails.locations) {
          const savedRule = result.rules.find(
            (rule) => rule.location_id === location.location_id,
          );

          values[location.location_id] = {
            min: savedRule
              ? String(savedRule.min_quantity)
              : fallback,
            max: savedRule
              ? String(savedRule.max_quantity)
              : fallback,
          };
        }

        if (!controller.signal.aborted) {
          setReorderRules(values);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setReorderRulesError(
            err instanceof Error
              ? err.message
              : "Unable to load reorder rules.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setReorderRulesLoading(false);
        }
      }
    }

    void loadReorderRules();

    return () => controller.abort();
  }, [id, details]);

  const editableProduct: EditableProduct | null = details
    ? {
        product_id: details.product.product_id,
        category_id: details.product.category_id,
        name: details.product.name,
        sku: details.product.sku,
        description: details.product.description ?? null,
        unit_of_measure: details.product.unit_of_measure,
        reorder_level: details.product.reorder_level,
        status: details.product.status === "archived" ? "archived" : "active",
      }
    : null;

  function handleProductSaved(): void {
    setEditing(false);
    setActionError("");
    setActionMessage("Product updated successfully.");
    void loadProduct();
  }

  async function handleArchive(): Promise<void> {
    if (!id || !details || !isManager) return;

    const confirmed = window.confirm(
      `Are you sure you want to archive "${details.product.name}"? This cannot be done while stock remains.`,
    );

    if (!confirmed) return;

    setArchiving(true);
    setActionError("");
    setActionMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/products/${encodeURIComponent(id)}/archive`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : `Archive failed. HTTP ${response.status}`;

        throw new Error(message);
      }

      setActionMessage("Product archived successfully.");
      await loadProduct();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Unable to archive product.",
      );
    } finally {
      setArchiving(false);
    }
  }

  function handleReorderRuleChange(
    locationId: string,
    field: "min" | "max",
    value: string,
  ): void {
    setReorderRules((current) => ({
      ...current,
      [locationId]: {
        ...current[locationId],
        [field]: value,
      },
    }));

    setReorderRulesError("");
    setReorderRuleMessage("");
  }

  async function handleSaveReorderRule(
    locationId: string,
  ): Promise<void> {
    if (!id || !isManager) return;

    const values = reorderRules[locationId];

    if (!values) return;

    const min = Number(values.min);
    const max = Number(values.max);

    if (
      values.min.trim() === "" ||
      values.max.trim() === "" ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min < 0 ||
      max < 0
    ) {
      setReorderRulesError(
        "Enter valid, non-negative minimum and maximum quantities.",
      );
      return;
    }

    if (max < min) {
      setReorderRulesError(
        "Maximum quantity must be greater than or equal to minimum quantity.",
      );
      return;
    }

    setSavingRuleLocation(locationId);
    setReorderRulesError("");
    setReorderRuleMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/products/${encodeURIComponent(id)}/reorder-rules`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            location_id: locationId,
            min_quantity: min,
            max_quantity: max,
          }),
        },
      );

      const data: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : `Unable to save reorder rule (HTTP ${response.status}).`;

        throw new Error(message);
      }

      setReorderRuleMessage("Reorder rule saved successfully.");
    } catch (err) {
      setReorderRulesError(
        err instanceof Error
          ? err.message
          : "Unable to save reorder rule.",
      );
    } finally {
      setSavingRuleLocation("");
    }
  }

  const product = details?.product;
  const totalOnHand = details ? Number(details.summary.total_on_hand) : 0;
  const stockStatus = totalOnHand <= 0 ? "out" : "available";

  const inventoryLink = product
    ? `/inventory?search=${encodeURIComponent(product.sku)}`
    : "/inventory";

  const historyLink = product
    ? `/movements?product_id=${encodeURIComponent(product.product_id)}`
    : "/movements";

  return (
    <AppLayout>
      <main className="page-container product-details-page pd-page">
        <div className="pd-breadcrumbs">
          <Link to="/product_list">
            <ArrowLeft size={14} /> Products
          </Link>
          <span aria-hidden="true">/</span>
          <span>Product details</span>
        </div>

        {loading && (
          <div className="pd-state" role="status">
            <RefreshCw size={20} className="pd-spinner" aria-hidden="true" />
            Loading product details…
          </div>
        )}

        {!loading && error && (
          <div className="pd-state" role="alert">
            <h2>Unable to load product</h2>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setRetryCount((count) => count + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && details && product && (
          <>
            <section className="pd-hero" aria-labelledby="pd-product-title">
              <div className="pd-hero-main">
                <span className="pd-product-icon" aria-hidden="true">
                  <Package size={27} strokeWidth={1.7} />
                </span>

                <div className="pd-hero-text">
                  <div className="pd-eyebrow">PRODUCT PROFILE</div>
                  <h1 id="pd-product-title">{product.name}</h1>

                  <div className="pd-product-meta">
                    <span className="pd-sku">SKU: {product.sku}</span>
                    <span className="pd-meta-separator" aria-hidden="true" />
                    <span>{product.category_name || "Uncategorised"}</span>
                    <span
                      className={`pd-pill ${
                        product.status === "active"
                          ? "pd-pill-active"
                          : "pd-pill-archived"
                      }`}
                    >
                      <span className="pd-pill-dot" aria-hidden="true" />
                      {product.status === "active" ? "Active" : "Archived"}
                    </span>
                  </div>
                </div>
              </div>

              {product.status === "active" && (
                <div className="pd-hero-actions">
                  {canManageStock && (
                    <>
                      <Link
                        className="btn btn-primary"
                        to={`/adjust_stock?product_id=${encodeURIComponent(
                          product.product_id,
                        )}`}
                      >
                        <Boxes size={16} aria-hidden="true" /> Adjust stock
                      </Link>

                      <Link
                        className="btn btn-secondary"
                        to={`/transfer_stock?product_id=${encodeURIComponent(
                          product.product_id,
                        )}`}
                      >
                        <ArrowLeftRight size={16} aria-hidden="true" /> Transfer
                      </Link>
                    </>
                  )}

                  {isManager && (
                    <>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => setEditing(true)}
                        disabled={archiving}
                      >
                        <Pencil size={16} aria-hidden="true" /> Edit product
                      </button>

                      <button
                        className="btn btn-secondary pd-archive-action"
                        type="button"
                        onClick={handleArchive}
                        disabled={archiving}
                      >
                        <Archive size={16} aria-hidden="true" />
                        {archiving ? "Archiving…" : "Archive"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </section>

            {actionMessage && (
              <p className="pd-feedback pd-feedback-success" role="status">
                {actionMessage}
              </p>
            )}

            {actionError && (
              <p className="pd-feedback pd-feedback-error" role="alert">
                {actionError}
              </p>
            )}

            <section className="pd-metrics" aria-label="Product stock summary">
              <div className="pd-metric pd-metric-primary">
                <div className="pd-metric-heading">
                  <span>Total stock on hand</span>
                  <Boxes size={19} aria-hidden="true" />
                </div>

                <strong className="pd-metric-value">
                  {formatQuantity(details.summary.total_on_hand)}
                </strong>

                <div className="pd-metric-footer">
                  <span
                    className={`pd-availability pd-availability-${stockStatus}`}
                  >
                    <span className="pd-pill-dot" aria-hidden="true" />
                    {totalOnHand <= 0 ? "Out of stock" : "Stock available"}
                  </span>
                  <span>{product.unit_of_measure}</span>
                </div>
              </div>

              <div className="pd-metric">
                <div className="pd-metric-heading">
                  <span>Reorder level</span>
                  <ClipboardCheck size={19} aria-hidden="true" />
                </div>
                <strong className="pd-metric-value">
                  {formatQuantity(product.reorder_level)}
                </strong>
                <p className="pd-metric-caption">
                  Minimum configured for this product
                </p>
              </div>

              <div className="pd-metric">
                <div className="pd-metric-heading">
                  <span>Active locations</span>
                  <Warehouse size={19} aria-hidden="true" />
                </div>
                <strong className="pd-metric-value">
                  {details.locations.length}
                </strong>
                <p className="pd-metric-caption">Locations shown below</p>
              </div>

              <div className="pd-metric">
                <div className="pd-metric-heading">
                  <span>Recent movements</span>
                  <ArrowLeftRight size={19} aria-hidden="true" />
                </div>
                <strong className="pd-metric-value">
                  {details.recent_movements.length}
                </strong>
                <p className="pd-metric-caption">
                  In this recent history view
                </p>
              </div>
            </section>

            <div className="pd-grid">
              <section
                className="pd-panel pd-overview"
                aria-labelledby="pd-overview-heading"
              >
                <div className="pd-panel-header">
                  <div>
                    <span className="pd-section-kicker">MASTER DATA</span>
                    <h2 id="pd-overview-heading">Product information</h2>
                  </div>
                  <Package
                    size={19}
                    className="pd-panel-icon"
                    aria-hidden="true"
                  />
                </div>

                <dl className="pd-info-grid">
                  <div>
                    <dt>Category</dt>
                    <dd>{product.category_name || "Uncategorised"}</dd>
                  </div>
                  <div>
                    <dt>Unit of measure</dt>
                    <dd>{product.unit_of_measure}</dd>
                  </div>
                  <div>
                    <dt>SKU</dt>
                    <dd className="pd-code">{product.sku}</dd>
                  </div>
                  <div>
                    <dt>Reorder level</dt>
                    <dd>{formatQuantity(product.reorder_level)}</dd>
                  </div>
                </dl>

                <div className="pd-description">
                  <h3>Description</h3>
                  <p>
                    {product.description?.trim() ||
                      "No description has been added for this product."}
                  </p>
                </div>
              </section>

              <section
                className="pd-panel pd-activity"
                aria-labelledby="pd-activity-heading"
              >
                <div className="pd-panel-header">
                  <div>
                    <span className="pd-section-kicker">TIMELINE</span>
                    <h2 id="pd-activity-heading">Product activity</h2>
                  </div>
                  <CalendarClock
                    size={19}
                    className="pd-panel-icon"
                    aria-hidden="true"
                  />
                </div>

                <dl className="pd-activity-list">
                  <div>
                    <dt>Last received</dt>
                    <dd>{formatDate(details.summary.last_received_at)}</dd>
                  </div>
                  <div>
                    <dt>Last stock count</dt>
                    <dd>{formatDate(details.summary.last_count_at)}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(product.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{formatDate(product.updated_at)}</dd>
                  </div>
                </dl>
              </section>
            </div>

            <section
              className="pd-panel pd-table-panel"
              aria-labelledby="pd-locations-heading"
            >
              <div className="pd-panel-header pd-panel-header-with-action">
                <div>
                  <span className="pd-section-kicker">DISTRIBUTION</span>
                  <h2 id="pd-locations-heading">Stock by location</h2>
                  <p>
                    Live balances and location-specific reorder thresholds.
                  </p>
                </div>

                <Link to={inventoryLink} className="pd-text-action">
                  Open inventory <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </div>

              {details.locations.length === 0 ? (
                <div className="pd-empty">
                  No active locations were found.
                </div>
              ) : reorderRulesLoading ? (
                <div className="pd-empty" role="status">
                  Loading location reorder rules…
                </div>
              ) : reorderRulesError ? (
                <div className="pd-state" role="alert">
                  <p>{reorderRulesError}</p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setReorderRules({});
                      setReorderRulesError("");
                      setRetryCount((count) => count + 1);
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {reorderRuleMessage && (
                    <p
                      className="pd-feedback pd-feedback-success"
                      role="status"
                    >
                      {reorderRuleMessage}
                    </p>
                  )}

                  <div className="pd-table-scroll">
                    <table className="data-table pd-table">
                      <thead>
                        <tr>
                          <th>Location</th>
                          <th>Location code</th>
                          <th className="pd-numeric">On hand</th>
                          <th className="pd-numeric">Minimum</th>
                          <th className="pd-numeric">Maximum</th>
                          {isManager && <th>Action</th>}
                        </tr>
                      </thead>

                      <tbody>
                        {details.locations.map((location) => {
                          const values = reorderRules[location.location_id];

                          return (
                            <tr key={location.location_id}>
                              <td>
                                <span className="pd-table-primary">
                                  <Warehouse
                                    size={15}
                                    aria-hidden="true"
                                  />
                                  {location.location_name}
                                </span>
                              </td>

                              <td>
                                <span className="pd-code">
                                  {location.location_code}
                                </span>
                              </td>

                              <td className="pd-numeric pd-quantity">
                                {formatQuantity(location.quantity)}
                              </td>

                              <td className="pd-numeric">
                                {isManager ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    aria-label={`Minimum reorder quantity for ${location.location_name}`}
                                    value={values?.min ?? ""}
                                    disabled={
                                      !values ||
                                      savingRuleLocation ===
                                        location.location_id
                                    }
                                    onChange={(event) =>
                                      handleReorderRuleChange(
                                        location.location_id,
                                        "min",
                                        event.target.value,
                                      )
                                    }
                                  />
                                ) : (
                                  formatQuantity(
                                    values?.min ?? product.reorder_level,
                                  )
                                )}
                              </td>

                              <td className="pd-numeric">
                                {isManager ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    aria-label={`Maximum reorder quantity for ${location.location_name}`}
                                    value={values?.max ?? ""}
                                    disabled={
                                      !values ||
                                      savingRuleLocation ===
                                        location.location_id
                                    }
                                    onChange={(event) =>
                                      handleReorderRuleChange(
                                        location.location_id,
                                        "max",
                                        event.target.value,
                                      )
                                    }
                                  />
                                ) : (
                                  formatQuantity(
                                    values?.max ?? product.reorder_level,
                                  )
                                )}
                              </td>

                              {isManager && (
                                <td>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={
                                      !values ||
                                      savingRuleLocation ===
                                        location.location_id
                                    }
                                    onClick={() =>
                                      void handleSaveReorderRule(
                                        location.location_id,
                                      )
                                    }
                                  >
                                    {savingRuleLocation ===
                                    location.location_id
                                      ? "Saving…"
                                      : "Save"}
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section
              className="pd-panel pd-table-panel"
              aria-labelledby="pd-movements-heading"
            >
              <div className="pd-panel-header pd-panel-header-with-action">
                <div>
                  <span className="pd-section-kicker">AUDIT TRAIL</span>
                  <h2 id="pd-movements-heading">Recent stock movements</h2>
                  <p>
                    Latest recorded transactions for this product.
                  </p>
                </div>

                <Link to={historyLink} className="pd-text-action">
                  Full history <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </div>

              {details.recent_movements.length === 0 ? (
                <div className="pd-empty">
                  No stock movements have been recorded for this product.
                </div>
              ) : (
                <div className="pd-table-scroll">
                  <table className="data-table pd-table pd-movement-table">
                    <thead>
                      <tr>
                        <th>Movement</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th className="pd-numeric">Change</th>
                        <th className="pd-numeric">Balance after</th>
                        <th>Recorded by</th>
                        <th>Reason</th>
                      </tr>
                    </thead>

                    <tbody>
                      {details.recent_movements.map((movement) => (
                        <tr key={movement.movement_id}>
                          <td>
                            <Link
                              className="pd-movement-link"
                              to={historyLink}
                            >
                              {movementLabel(movement)}
                            </Link>
                          </td>

                          <td>{formatDate(movement.created_at)}</td>
                          <td>{movement.location_name || "Not available"}</td>

                          <td className="pd-numeric">
                            <span
                              className={`pd-change ${
                                Number(movement.quantity_change) >= 0
                                  ? "pd-change-in"
                                  : "pd-change-out"
                              }`}
                            >
                              {Number(movement.quantity_change) >= 0 ? (
                                <ArrowDownLeft
                                  size={13}
                                  aria-hidden="true"
                                />
                              ) : (
                                <ArrowUpRight
                                  size={13}
                                  aria-hidden="true"
                                />
                              )}

                              {Number(movement.quantity_change) > 0
                                ? "+"
                                : ""}
                              {formatQuantity(movement.quantity_change)}
                            </span>
                          </td>

                          <td className="pd-numeric pd-quantity">
                            {formatQuantity(movement.quantity_after)}
                          </td>

                          <td>{movement.user_name || "Not available"}</td>
                          <td>{movement.reason || "Not specified"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {editing && isManager && editableProduct && (
          <EditProductModal
            key={editableProduct.product_id}
            product={editableProduct}
            categories={categories}
            categoriesLoading={categoriesLoading}
            categoriesError={categoriesError}
            onClose={() => setEditing(false)}
            onSaved={handleProductSaved}
          />
        )}
      </main>
    </AppLayout>
  );
}
