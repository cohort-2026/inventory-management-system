
import { useState } from "react";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import "./AdjustStock.css";

// FRONTEND MOCK DATA
const products = [
  { id: 1, name: "Bananas" },
  { id: 2, name: "Apples" },
  { id: 3, name: "Oranges" },
];

const locations = [
  { id: 1, name: "Main Warehouse" },
  { id: 2, name: "Store Room" },
  { id: 3, name: "Retail Store" },
];

// Mock inventory
const initialInventory = [
  { productId: 1, locationId: 1, quantity: 25 },
  { productId: 1, locationId: 2, quantity: 10 },
  { productId: 2, locationId: 1, quantity: 40 },
  { productId: 2, locationId: 2, quantity: 15 },
  { productId: 3, locationId: 1, quantity: 30 },
  { productId: 3, locationId: 3, quantity: 12 },
];

export default function AdjustStock() {
  const [inventory, setInventory] =
    useState(initialInventory);

  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");

  const [type, setType] =
    useState<"increase" | "decrease">("increase");

  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>(
    {}
  );

  const [saving, setSaving] = useState(false);

  // Find current stock
  const selectedStock = inventory.find(
    (item) =>
      item.productId === Number(productId) &&
      item.locationId === Number(locationId)
  );

  const currentStock = selectedStock?.quantity ?? null;

  const amount = Number(quantity);

  const newQuantity =
    currentStock === null
      ? null
      : type === "increase"
        ? currentStock + amount
        : currentStock - amount;

  // Validate fields
  function validate() {
    const newErrors: Record<string, string> = {};

    if (!productId) {
      newErrors.productId = "Please select a product.";
    }

    if (!locationId) {
      newErrors.locationId = "Please select a location.";
    }

    if (
      quantity.trim() === "" ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      newErrors.quantity =
        "Enter a positive whole number.";
    }

    if (!reason.trim()) {
      newErrors.reason = "Reason is required.";
    }

    if (
      currentStock !== null &&
      type === "decrease" &&
      amount > currentStock
    ) {
      newErrors.quantity =
        `Only ${currentStock} units are available in stock.`;
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  }

  // Save adjustment locally
  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setMessage("");

    if (!validate()) return;

    setSaving(true);

    const updatedQuantity = newQuantity!;

    setInventory((previous) => {
      const exists = previous.some(
        (item) =>
          item.productId === Number(productId) &&
          item.locationId === Number(locationId)
      );

      if (!exists) {
        return [
          ...previous,
          {
            productId: Number(productId),
            locationId: Number(locationId),
            quantity: updatedQuantity,
          },
        ];
      }

      return previous.map((item) =>
        item.productId === Number(productId) &&
        item.locationId === Number(locationId)
          ? { ...item, quantity: updatedQuantity }
          : item
      );
    });

    setMessage(
      `Stock adjusted successfully! New quantity: ${updatedQuantity} units.`
    );

    setQuantity("");
    setReason("");
    setNotes("");
    setErrors({});
    setSaving(false);
  }

  return (
    <AppLayout>
      <PageHeader
        title="Adjust Stock"
        subtitle="Increase or decrease available inventory."
      />

      <Card>
        <form onSubmit={handleSubmit} noValidate>

          <div className="adjust-field">
            <label htmlFor="productId">Product</label>

            <select
              id="productId"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setMessage("");
              }}
              aria-invalid={!!errors.productId}
              aria-describedby="productId-error"
            >
              <option value="">Select product</option>

              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>

            {errors.productId && (
              <p id="productId-error" role="alert">
                {errors.productId}
              </p>
            )}
          </div>

          <div className="adjust-field">
            <label htmlFor="locationId">Location</label>

            <select
              id="locationId"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setMessage("");
              }}
              aria-invalid={!!errors.locationId}
              aria-describedby="locationId-error"
            >
              <option value="">Select location</option>

              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>

            {errors.locationId && (
              <p id="locationId-error" role="alert">
                {errors.locationId}
              </p>
            )}
          </div>

          <div className="current-stock">
            <span>Current Stock</span>
            <h2>
              {currentStock === null
                ? "Select product and location"
                : `${currentStock} units`}
            </h2>
          </div>

          <fieldset className="adjust-field">
            <legend>Adjustment Type</legend>

            <label>
              <input
                type="radio"
                checked={type === "increase"}
                onChange={() => setType("increase")}
                name="type"
              />
              Increase Stock
            </label>

            <label>
              <input
                type="radio"
                checked={type === "decrease"}
                onChange={() => setType("decrease")}
                name="type"
              />
              Decrease Stock
            </label>
          </fieldset>

          <div className="adjust-field">
            <label htmlFor="quantity">Quantity</label>

            <input
              id="quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              aria-invalid={!!errors.quantity}
              aria-describedby="quantity-error"
            />

            {errors.quantity && (
              <p id="quantity-error" role="alert">
                {errors.quantity}
              </p>
            )}
          </div>

          <div className="adjust-field">
            <label htmlFor="reason">Reason</label>

            <select
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!errors.reason}
              aria-describedby="reason-error"
            >
              <option value="">Select reason</option>
              <option value="New stock received">
                New stock received
              </option>
              <option value="Damaged goods">
                Damaged goods
              </option>
              <option value="Stock correction">
                Stock correction
              </option>
              <option value="Stock count adjustment">
                Stock count adjustment
              </option>
              <option value="Other">Other</option>
            </select>

            {errors.reason && (
              <p id="reason-error" role="alert">
                {errors.reason}
              </p>
            )}
          </div>

          <div className="adjust-field">
            <label htmlFor="notes">Notes (Optional)</label>

            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional information..."
              aria-invalid={false}
              aria-describedby="notes-help"
            />

            <small id="notes-help">
              Optional additional information.
            </small>
          </div>

          {newQuantity !== null &&
            quantity !== "" &&
            Number.isInteger(amount) &&
            amount > 0 && (
              <div className="new-stock">
                <span>New Stock Quantity</span>
                <h2>{newQuantity} units</h2>
              </div>
            )}

          {message && (
            <p className="success-message" role="status">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : "Confirm Adjustment"}
          </button>

        </form>
      </Card>
    </AppLayout>
  );
}
