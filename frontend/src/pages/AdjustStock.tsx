import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import SelectField from "../components/SelectField";
import Field from "../components/Field";
import {
  adjustInventory,
  getInventory,
  getLocations,
  getProducts,
} from "../services/api";
import type {
  InventoryRecord,
  LocationOption,
  ProductOption,
} from "../services/api";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

export default function AdjustStock() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [adjustment, setAdjustment] = useState("0");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([getProducts(), getLocations(), getInventory()])
      .then(([loadedProducts, loadedLocations, loadedInventory]) => {
        if (!active) return;

        setProducts(loadedProducts);
        setLocations(loadedLocations);
        setInventory(loadedInventory);
        setProductId(loadedProducts[0]?.product_id ?? "");
        setLocationId(loadedLocations[0]?.location_id ?? "");
      })
      .catch((loadError: unknown) => {
        if (active) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const currentQuantity = useMemo(
    () =>
      inventory.find(
        (record) =>
          record.product_id === productId &&
          record.location_id === locationId,
      )?.quantity ?? 0,
    [inventory, locationId, productId],
  );
  const adjustmentAmount = Number(adjustment);
  const newQuantity = currentQuantity + adjustmentAmount;
  const hasSelection = Boolean(productId && locationId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!hasSelection) {
      setError("Select an active product and location.");
      return;
    }

    if (!Number.isFinite(adjustmentAmount) || adjustmentAmount === 0) {
      setError("Enter a non-zero adjustment amount.");
      return;
    }

    if (newQuantity < 0) {
      setError("The adjustment cannot reduce stock below zero.");
      return;
    }

    if (!reason) {
      setError("Select a reason for the adjustment.");
      return;
    }

    setSaving(true);

    try {
      const updatedInventory = await adjustInventory({
        product_id: productId,
        location_id: locationId,
        adjustment: adjustmentAmount,
        reason,
        notes: notes.trim(),
      });

      setInventory((records) => {
        const existingIndex = records.findIndex(
          (record) => record.inventory_id === updatedInventory.inventory_id,
        );

        if (existingIndex < 0) return [...records, updatedInventory];

        return records.map((record) =>
          record.inventory_id === updatedInventory.inventory_id
            ? updatedInventory
            : record,
        );
      });
      setAdjustment("0");
      setNotes("");
      setSuccess("Stock adjustment confirmed.");
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Adjust Stock" />

      <div className="form-with-sidebar">
        <form onSubmit={handleSubmit}>
          <SelectField
            label="Product *"
            options={products.map((product) => ({
              value: product.product_id,
              label: `${product.name} (${product.sku})`,
            }))}
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            required
            disabled={loading || products.length === 0}
          />
          <SelectField
            label="Location *"
            options={locations.map((location) => ({
              value: location.location_id,
              label: location.name,
            }))}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            required
            disabled={loading || locations.length === 0}
          />

          <div className="field">
            <span className="field-label">Current Quantity</span>
            <p className="calc-result">{currentQuantity}</p>
          </div>

          <Field
            label="Adjustment *"
            type="number"
            step="any"
            min={-currentQuantity}
            value={adjustment}
            onChange={(event) => setAdjustment(event.target.value)}
            required
            disabled={loading || !hasSelection}
          />

          <div className="field">
            <span className="field-label">New Quantity</span>
            <p className="calc-result" style={{ color: "var(--color-success)" }}>
              {Number.isFinite(newQuantity) ? newQuantity : "—"}
            </p>
          </div>

          <SelectField
            label="Reason *"
            placeholder="Select reason"
            options={[
              { value: "recount", label: "Recount" },
              { value: "damage", label: "Damage" },
              { value: "received", label: "Received shipment" },
            ]}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            disabled={loading}
          />

          <div className="field">
            <label className="field-label" htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              className="field-textarea"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              disabled={loading}
            />
          </div>

          {loading && <p role="status">Loading products and stock…</p>}
          {!loading && products.length === 0 && (
            <p role="alert">No active products are available to adjust.</p>
          )}
          {!loading && locations.length === 0 && (
            <p role="alert">No active locations are available to adjust.</p>
          )}
          {error && <p role="alert" className="field-error">{error}</p>}
          {success && <p role="status">{success}</p>}

          <div className="page-actions">
            <Link to="/product_list" className="btn btn-secondary">Cancel</Link>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || saving || !hasSelection}
            >
              {saving ? "Saving…" : "Confirm Adjustment"}
            </button>
          </div>
        </form>

        <Card title="Calculation">
          <p className="calc-line">New = Current + Adjustment</p>
          <p className="calc-result">
            {currentQuantity} + {adjustment || 0} ={" "}
            {Number.isFinite(newQuantity) ? newQuantity : "—"}
          </p>
          <p className="field-hint">Adjustments that would take stock below zero are blocked.</p>
        </Card>
      </div>
    </AppLayout>
  );
}
