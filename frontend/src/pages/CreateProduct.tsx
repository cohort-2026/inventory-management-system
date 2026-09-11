import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import Field from "../components/Field";
import SelectField from "../components/SelectField";

export default function CreateProduct() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("each");
  const [reorderLevel, setReorderLevel] = useState(0);
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: POST to /api/products once that route exists.
    navigate("/products");
  }

  return (
    <AppLayout>
      <PageHeader breadcrumb="Products / New Product" title="Create Product" />

      <div className="form-with-sidebar">
        <form onSubmit={handleSubmit}>
          <h3 className="form-section-title">Basic Information</h3>

          <Field
            label="Product Name *"
            placeholder="e.g. Widget A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Field
            label="SKU *"
            placeholder="e.g. W-001"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            required
          />

          <div className="field-row">
            <SelectField
              label="Category *"
              placeholder="Select category"
              options={[
                { value: "hardware", label: "Hardware" },
                { value: "tools", label: "Tools" },
                { value: "electronics", label: "Electronics" },
              ]}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
            <SelectField
              label="Unit of Measure *"
              options={[
                { value: "each", label: "Each" },
                { value: "box", label: "Box" },
                { value: "case", label: "Case" },
              ]}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
            />
          </div>

          <Field
            label="Reorder Level"
            type="number"
            min={0}
            value={reorderLevel}
            onChange={(e) => setReorderLevel(Number(e.target.value))}
          />

          <div className="field">
            <label className="field-label" htmlFor="description">Description</label>
            <textarea
              id="description"
              className="field-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="page-actions">
            <Link to="/product_list" className="btn btn-secondary">Cancel</Link>
            <button type="submit" className="btn btn-primary">Create Product</button>
          </div>
        </form>

        <Card title="Validation">
          <ul className="validation-list">
            <li>Product name required</li>
            <li>SKU required &amp; unique</li>
            <li>Category required</li>
            <li>Quantities must be valid numbers</li>
            <li>Reorder level ≥ 0</li>
          </ul>
        </Card>
      </div>
    </AppLayout>
  );
}