
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import AppLayout from "../components/AppLayout";
import { getProductDetails } from "../services/api";
import type {
  ProductDetailResponse,
  ProductRecentMovement,
} from "../services/api";
import { useAuth } from "../utils/AuthContext";

const API_BASE_URL = `${
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
}/api`;

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

  return (
    <AppLayout>
      <main className="page-container">
        <div className="page-header">
          <div>
            <h1>Product Details</h1>
            <p>
              Product information, stock by location and movement history.
            </p>
          </div>

          <Link to="/product_list" className="button button-secondary">
            Back to Products
          </Link>
        </div>

        {loading && (
          <section className="card">
            <p>Loading product details...</p>
          </section>
        )}

        {!loading && error && (
          <section className="card">
            <h2>Unable to load product</h2>
            <p role="alert">{error}</p>

            <button
              type="button"
              className="button button-primary"
              onClick={() => setRetryCount((count) => count + 1)}
            >
              Try Again
            </button>
          </section>
        )}

        {!loading && !error && details && (
          <>
            <section className="card">
              <div className="product-details-heading">
                <div>
                  <h2>{details.product.name}</h2>
                  <p>SKU: {details.product.sku}</p>
                </div>

                <span
                  className={`status-badge ${
                    details.product.status === "active"
                      ? "status-active"
                      : "status-archived"
                  }`}
                >
                  {details.product.status}
                </span>
              </div>

              <div className="product-information-grid">
                <div>
                  <span className="detail-label">Category</span>
                  <strong>
                    {details.product.category_name || "Uncategorised"}
                  </strong>
                </div>

                <div>
                  <span className="detail-label">Unit of measure</span>
                  <strong>{details.product.unit_of_measure}</strong>
                </div>

                <div>
                  <span className="detail-label">Reorder level</span>
                  <strong>
                    {formatQuantity(details.product.reorder_level)}
                  </strong>
                </div>

                <div>
                  <span className="detail-label">Total stock on hand</span>
                  <strong>
                    {formatQuantity(details.summary.total_on_hand)}
                  </strong>
                </div>
              </div>

              {details.product.description && (
                <div className="product-description">
                  <span className="detail-label">Description</span>
                  <p>{details.product.description}</p>
                </div>
              )}

              {actionMessage && (
                <p role="status">{actionMessage}</p>
              )}

              {actionError && (
                <p role="alert">{actionError}</p>
              )}

              {details.product.status === "active" && (
                <div className="product-actions">
                  {canManageStock && (
                    <>
                      <Link
                        to={`/adjust_stock?product_id=${encodeURIComponent(
                          details.product.product_id,
                        )}`}
                        className="button button-primary"
                      >
                        Adjust Stock
                      </Link>

                      <Link
                        to={`/transfer_stock?product_id=${encodeURIComponent(
                          details.product.product_id,
                        )}`}
                        className="button button-secondary"
                      >
                        Transfer Stock
                      </Link>
                    </>
                  )}

                  {isManager && (
                    <>
                      <Link
                        to={`/product_list?edit=${encodeURIComponent(
                          details.product.product_id,
                        )}`}
                        className="button button-secondary"
                      >
                        Edit Product
                      </Link>

                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={handleArchive}
                        disabled={archiving}
                      >
                        {archiving ? "Archiving..." : "Archive Product"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="card">
              <h2>Stock by Location</h2>
              <p>Stock balances at every active location.</p>

              {details.locations.length === 0 ? (
                <p>No active locations were found.</p>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Location Code</th>
                        <th>Quantity</th>
                      </tr>
                    </thead>

                    <tbody>
                      {details.locations.map((location) => (
                        <tr key={location.location_id}>
                          <td>{location.location_name}</td>
                          <td>{location.location_code}</td>
                          <td>{formatQuantity(location.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h2>Recent Movement History</h2>
              <p>Latest stock movements recorded for this product.</p>

              {details.recent_movements.length === 0 ? (
                <p>
                  No stock movements have been recorded for this product.
                </p>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Movement</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Quantity Change</th>
                        <th>Balance After</th>
                        <th>Recorded By</th>
                        <th>Reason</th>
                      </tr>
                    </thead>

                    <tbody>
                      {details.recent_movements.map((movement) => (
                        <tr key={movement.movement_id}>
                          <td>
                            <Link to="/movements">
                              {movementLabel(movement)}
                            </Link>
                          </td>
                          <td>{formatDate(movement.created_at)}</td>
                          <td>
                            {movement.location_name || "Not available"}
                          </td>
                          <td>
                            {formatQuantity(movement.quantity_change)}
                          </td>
                          <td>
                            {formatQuantity(movement.quantity_after)}
                          </td>
                          <td>
                            {movement.user_name || "Not available"}
                          </td>
                          <td>{movement.reason || "Not specified"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h2>Product Activity</h2>

              <div className="product-information-grid">
                <div>
                  <span className="detail-label">Last received</span>
                  <strong>
                    {formatDate(details.summary.last_received_at)}
                  </strong>
                </div>

                <div>
                  <span className="detail-label">Last stock count</span>
                  <strong>
                    {formatDate(details.summary.last_count_at)}
                  </strong>
                </div>

                <div>
                  <span className="detail-label">Created</span>
                  <strong>
                    {formatDate(details.product.created_at)}
                  </strong>
                </div>

                <div>
                  <span className="detail-label">Last updated</span>
                  <strong>
                    {formatDate(details.product.updated_at)}
                  </strong>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </AppLayout>
  );
}
