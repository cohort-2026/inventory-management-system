import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import SelectField from "../components/SelectField";
import Field from "../components/Field";

// Mock — swap for a real lookup once GET /api/inventory exists.
const CURRENT_QUANTITY = 125;

export default function AdjustStock() {
  const [adjustment, setAdjustment] = useState(10);
  const newQuantity = useMemo(() => CURRENT_QUANTITY + adjustment, [adjustment]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: POST to /api/inventory/adjust once that route exists.
  }

  return (
    <AppLayout>
      <PageHeader title="Adjust Stock" />

      <div className="form-with-sidebar">
        <form onSubmit={handleSubmit}>
          <SelectField label="Product *" options={[{ value: "w-001", label: "Widget A" }]} defaultValue="w-001" required />
          <SelectField
            label="Location *"
            options={[{ value: "main", label: "Main Warehouse" }, { value: "storage", label: "Storage Unit" }]}
            defaultValue="main"
            required
          />

          <div className="field">
            <span className="field-label">Current Quantity</span>
            <p className="calc-result">{CURRENT_QUANTITY}</p>
          </div>

          <Field
            label="Adjustment"
            type="number"
            value={adjustment}
            onChange={(e) => setAdjustment(Number(e.target.value))}
          />

          <div className="field">
            <span className="field-label">New Quantity</span>
            <p className="calc-result" style={{ color: "var(--color-success)" }}>{newQuantity}</p>
          </div>

          <SelectField
            label="Reason *"
            placeholder="Select reason"
            options={[
              { value: "recount", label: "Recount" },
              { value: "damage", label: "Damage" },
              { value: "received", label: "Received shipment" },
            ]}
            required
          />

          <div className="field">
            <label className="field-label" htmlFor="notes">Notes</label>
            <textarea id="notes" className="field-textarea" />
          </div>

          <div className="page-actions">
            <Link to="/product_list" className="btn btn-secondary">Cancel</Link>
            <button type="submit" className="btn btn-primary">Confirm Adjustment</button>
          </div>
        </form>

        <Card title="Calculation">
          <p className="calc-line">New = Current + Adjustment</p>
          <p className="calc-result">{CURRENT_QUANTITY} + {adjustment} = {newQuantity}</p>
          <p className="field-hint">Negative results are blocked before submission.</p>
        </Card>
      </div>
    </AppLayout>
  );
}