import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import SelectField from "../components/SelectField";
import Field from "../components/Field";

// Mock — swap for a real lookup once GET /api/inventory exists.
const FROM_AVAILABLE = 125;
const TO_AVAILABLE = 15;

export default function TransferStock() {
  const [quantity, setQuantity] = useState(20);
  const fromAfter = useMemo(() => FROM_AVAILABLE - quantity, [quantity]);
  const toAfter = useMemo(() => TO_AVAILABLE + quantity, [quantity]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: POST to /api/inventory/transfer once that route exists.
  }

  return (
    <AppLayout>
      <PageHeader title="Transfer Stock" />

      <div className="form-with-sidebar">
        <form onSubmit={handleSubmit}>
          <SelectField label="Product *" options={[{ value: "w-001", label: "Widget A" }]} defaultValue="w-001" required />

          <div className="field-row">
            <SelectField
              label="From Location *"
              options={[{ value: "main", label: "Main Warehouse" }, { value: "storage", label: "Storage Unit" }]}
              defaultValue="main"
              required
            />
            <SelectField
              label="To Location *"
              options={[{ value: "storage", label: "Storage Unit" }, { value: "main", label: "Main Warehouse" }]}
              defaultValue="storage"
              required
            />
          </div>

          <p className="field-hint">Available at source: <span className="mono">{FROM_AVAILABLE}</span></p>

          <Field
            label="Quantity *"
            type="number"
            min={1}
            max={FROM_AVAILABLE}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            required
          />

          <div className="field">
            <label className="field-label" htmlFor="reason">Reason / Note</label>
            <textarea id="reason" className="field-textarea" />
          </div>

          <div className="page-actions">
            <Link to="/product_list" className="btn btn-secondary">Cancel</Link>
            <button type="submit" className="btn btn-primary">Review Transfer</button>
          </div>
        </form>

        <Card title="Preview">
          <div className="transfer-box">
            <p className="transfer-box-label">Main Warehouse</p>
            <p className="transfer-box-value">{FROM_AVAILABLE} → {fromAfter}</p>
          </div>
          <p className="transfer-arrow">↓</p>
          <div className="transfer-box">
            <p className="transfer-box-label">Storage Unit</p>
            <p className="transfer-box-value">{TO_AVAILABLE} → {toAfter}</p>
          </div>
          <p className="field-hint">Quantity: {quantity}</p>
        </Card>
      </div>
    </AppLayout>
  );
}