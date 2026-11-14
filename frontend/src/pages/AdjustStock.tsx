
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import SelectField from "../components/SelectField";
import Field from "../components/Field";
import {
  createStockMovement,
  getInventory,
  getLocations,
  getProducts,
  getReasonCodes,
} from "../services/api";
import type {
  InventoryRecord,
  LocationOption,
  ProductOption,
  ReasonCode,
  StockMovementType,
} from "../services/api";

const MOVEMENT_OPTIONS: {
  value: StockMovementType;
  label: string;
}[] = [
  { value: "RECEIPT", label: "Receipt" },
  { value: "SALE", label: "Sale" },
  { value: "CUSTOMER_RETURN", label: "Customer Return" },
  { value: "WRITE_OFF", label: "Write-off" },
  { value: "ADJUSTMENT", label: "Adjustment" },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

export default function AdjustStock() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [reasonCodes, setReasonCodes] = useState<ReasonCode[]>([]);
  const [reasonCodesType, setReasonCodesType] =
    useState<StockMovementType | null>(null);

  const [movementType, setMovementType] =
    useState<StockMovementType>("ADJUSTMENT");

  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [reasonCodeId, setReasonCodeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [direction, setDirection] =
    useState<"increase" | "decrease">("increase");

  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Reason codes are loading whenever they do not match
  // the currently selected movement type.
  const loadingReasons = reasonCodesType !== movementType;

  // Load products, locations and existing inventory.
  useEffect(() => {
    let active = true;

    Promise.all([
      getProducts(),
      getLocations(),
      getInventory(),
    ])
      .then(([loadedProducts, loadedLocations, loadedInventory]) => {
        if (!active) return;

        setProducts(loadedProducts);
        setLocations(loadedLocations);
        setInventory(loadedInventory);

        setProductId(loadedProducts[0]?.product_id ?? "");
        setLocationId(loadedLocations[0]?.location_id ?? "");
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Load reason codes for the selected movement type.
  useEffect(() => {
    let active = true;

    getReasonCodes(movementType)
      .then((codes) => {
        if (!active) return;

        setReasonCodes(codes);
        setReasonCodeId(codes[0]?.reason_code_id ?? "");
        setReasonCodesType(movementType);
      })
      .catch((reasonError: unknown) => {
        if (!active) return;

        setReasonCodes([]);
        setReasonCodeId("");
        setReasonCodesType(movementType);
        setError(getErrorMessage(reasonError));
      });

    return () => {
      active = false;
    };
  }, [movementType]);

  const currentQuantity = useMemo(
    () =>
      inventory.find(
        (record) =>
          record.product_id === productId &&
          record.location_id === locationId,
      )?.quantity ?? 0,
    [inventory, locationId, productId],
  );

  const selectedReason = reasonCodes.find(
    (reason) => reason.reason_code_id === reasonCodeId,
  );

  const quantityAmount = Number(quantity);

  const signedChange =
    movementType === "RECEIPT" ||
    movementType === "CUSTOMER_RETURN"
      ? quantityAmount
      : movementType === "ADJUSTMENT"
        ? direction === "increase"
          ? quantityAmount
          : -quantityAmount
        : -quantityAmount;

  const newQuantity = currentQuantity + signedChange;

  const hasSelection = Boolean(productId && locationId);

  const requiresReference =
    movementType === "RECEIPT" || movementType === "SALE";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!hasSelection) {
      setError("Select an active product and location.");
      return;
    }

    if (
      !Number.isFinite(quantityAmount) ||
      quantityAmount <= 0 ||
      !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(quantity) ||
      !/[1-9]/.test(quantity)
    ) {
      setError("Enter a valid positive quantity.");
      return;
    }

    if (
      (movementType === "SALE" ||
        movementType === "WRITE_OFF" ||
        (movementType === "ADJUSTMENT" && direction === "decrease")) &&
      newQuantity < 0
    ) {
      setError("This movement cannot reduce stock below zero.");
      return;
    }

    if (loadingReasons || !reasonCodeId || !selectedReason) {
      setError("Wait for the reason codes to load and select a valid reason.");
      return;
    }

    if (requiresReference && !referenceNo.trim()) {
      setError("A reference number is required for this movement.");
      return;
    }

    if (referenceNo.trim().length > 60) {
      setError("The reference number cannot exceed 60 characters.");
      return;
    }

    if (notes.trim().length > 2000) {
      setError("Notes cannot exceed 2000 characters.");
      return;
    }

    if (selectedReason.requires_note && !notes.trim()) {
      setError("Notes are required for the selected reason.");
      return;
    }

    setSaving(true);

    try {
      const movementInput = {
        product_id: productId,
        location_id: locationId,
        movement_type: movementType,
        quantity,
        reason_code_id: reasonCodeId,
        ...(movementType === "ADJUSTMENT" ? { direction } : {}),
        ...(referenceNo.trim()
          ? { reference_no: referenceNo.trim() }
          : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };

      await createStockMovement(movementInput);

      setSuccess("Stock movement recorded successfully.");

      setQuantity("1");
      setReferenceNo("");
      setNotes("");

      try {
        const updatedInventory = await getInventory();
        setInventory(updatedInventory);
      } catch {
        setSuccess(
          "Stock movement recorded successfully. Reload the page to refresh the displayed stock quantity.",
        );
      }
    } catch (submitError: unknown) {
      setError(getErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Record Stock Movement" />

      <div className="form-with-sidebar">
        <form onSubmit={handleSubmit}>
          <SelectField
            label="Movement Type *"
            options={MOVEMENT_OPTIONS}
            value={movementType}
            onChange={(event) =>
              setMovementType(event.target.value as StockMovementType)
            }
            required
            disabled={loading || saving}
          />

          <SelectField
            label="Product *"
            options={products.map((product) => ({
              value: product.product_id,
              label: `${product.name} (${product.sku})`,
            }))}
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            required
            disabled={loading || products.length === 0 || saving}
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
            disabled={loading || locations.length === 0 || saving}
          />

          <div className="field">
            <span className="field-label">Current Quantity</span>
            <p className="calc-result">{currentQuantity}</p>
          </div>

          {movementType === "ADJUSTMENT" && (
            <SelectField
              label="Adjustment Direction *"
              options={[
                { value: "increase", label: "Increase stock" },
                { value: "decrease", label: "Decrease stock" },
              ]}
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as "increase" | "decrease")
              }
              required
              disabled={loading || saving}
            />
          )}

          <Field
            label="Quantity *"
            type="number"
            step="any"
            min="0.01"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
            disabled={loading || !hasSelection || saving}
          />

          <div className="field">
            <span className="field-label">New Quantity</span>
            <p
              className="calc-result"
              style={{
                color:
                  newQuantity < 0
                    ? "var(--color-danger)"
                    : "var(--color-success)",
              }}
            >
              {Number.isFinite(newQuantity) ? newQuantity : "—"}
            </p>
          </div>

          <SelectField
            label="Reason *"
            placeholder={
              loadingReasons ? "Loading reasons..." : "Select reason"
            }
            options={reasonCodes.map((reason) => ({
              value: reason.reason_code_id,
              label: reason.label,
            }))}
            value={reasonCodeId}
            onChange={(event) => setReasonCodeId(event.target.value)}
            required
            disabled={
              loading ||
              loadingReasons ||
              reasonCodes.length === 0 ||
              saving
            }
          />

          {requiresReference && (
            <Field
              label="Reference Number *"
              type="text"
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
              maxLength={60}
              required
              disabled={loading || saving}
            />
          )}

          <div className="field">
            <label className="field-label" htmlFor="movement-notes">
              Notes {selectedReason?.requires_note ? "*" : ""}
            </label>
            <textarea
              id="movement-notes"
              className="field-textarea"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              required={selectedReason?.requires_note ?? false}
              disabled={loading || saving}
            />
            {selectedReason?.requires_note && (
              <p className="field-hint">
                Notes are required for this reason.
              </p>
            )}
          </div>

          {loading && (
            <p role="status">Loading products and stock...</p>
          )}

          {!loading && products.length === 0 && (
            <p role="alert">No active products are available.</p>
          )}

          {!loading && locations.length === 0 && (
            <p role="alert">No active locations are available.</p>
          )}

          {!loading && !loadingReasons && reasonCodes.length === 0 && (
            <p role="alert">
              No active reason codes are configured for this movement type.
            </p>
          )}

          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}

          {success && <p role="status">{success}</p>}

          <div className="page-actions">
            <Link to="/product_list" className="btn btn-secondary">
              Cancel
            </Link>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                loading ||
                loadingReasons ||
                saving ||
                !hasSelection ||
                reasonCodes.length === 0
              }
            >
              {saving ? "Saving..." : "Record Movement"}
            </button>
          </div>
        </form>

        <Card title="Movement Summary">
          <p className="calc-line">
            Movement:{" "}
            {
              MOVEMENT_OPTIONS.find(
                (option) => option.value === movementType,
              )?.label
            }
          </p>

          <p className="calc-line">
            Current quantity: {currentQuantity}
          </p>

          <p className="calc-line">
            Quantity change:{" "}
            {Number.isFinite(signedChange) ? signedChange : "—"}
          </p>

          <p className="calc-result">
            New quantity:{" "}
            {Number.isFinite(newQuantity) ? newQuantity : "—"}
          </p>

          <p className="field-hint">
            The server validates stock availability, product status,
            location status and quantity rules before saving.
          </p>
        </Card>
      </div>
    </AppLayout>
  );
}
