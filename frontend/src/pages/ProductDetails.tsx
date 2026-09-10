import { useParams, Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";

// Mock data — swap for a fetch to GET /api/products/:sku once that route exists.
const PRODUCT = {
  name: "Widget A",
  sku: "W-001",
  status: "Active",
  category: "Hardware",
  unit: "Each",
  reorderLevel: 20,
  description: "Standard Widget",
};

const INVENTORY_BY_LOCATION = [
  { location: "Main Warehouse", available: 125, reorder: 20, status: "ok" as const },
  { location: "Storage Unit", available: 15, reorder: 20, status: "low" as const },
];

const RECENT_MOVEMENTS = [
  { date: "Aug 28", type: "Adjustment", location: "Main", change: "+10", user: "John" },
  { date: "Aug 27", type: "Transfer", location: "Main", change: "-5", user: "Sarah" },
];

export default function ProductDetails() {
  const { sku } = useParams(); // would drive the real fetch above

  return (
    <AppLayout>
      <PageHeader
        breadcrumb="Products / Widget A"
        title={PRODUCT.name}
        actions={
          <div style={{ textAlign: "right" }}>
            <p className="page-subtitle">SKU: {PRODUCT.sku} · Status: {PRODUCT.status}</p>
            <div className="page-actions" style={{ marginTop: "var(--space-2)" }}>
              <Link to={`/products/${sku}/edit`} className="btn btn-secondary">Edit</Link>
              <button className="btn btn-secondary">More ▾</button>
            </div>
          </div>
        }
      />

      <Card title="Product Information">
        <div className="info-grid">
          <div>
            <span className="info-item-label">Category</span>
            <span className="info-item-value">{PRODUCT.category}</span>
          </div>
          <div>
            <span className="info-item-label">Unit</span>
            <span className="info-item-value">{PRODUCT.unit}</span>
          </div>
          <div>
            <span className="info-item-label">Reorder Level</span>
            <span className="info-item-value">{PRODUCT.reorderLevel}</span>
          </div>
          <div>
            <span className="info-item-label">Description</span>
            <span className="info-item-value">{PRODUCT.description}</span>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: "var(--space-5)" }}>
        <h3 className="form-section-title">Inventory</h3>
        <DataTable
          columns={[
            { header: "Location", render: (r) => r.location },
            { header: "Available", render: (r) => r.available, mono: true },
            { header: "Reorder", render: (r) => r.reorder, mono: true },
            { header: "Status", render: (r) => <Badge status={r.status}>{r.status.toUpperCase()}</Badge> },
          ]}
          rows={INVENTORY_BY_LOCATION}
          keyField={(r) => r.location}
        />
      </div>

      <div className="page-actions" style={{ margin: "var(--space-4) 0" }}>
        <Link to="/adjust_stock" className="btn btn-primary">Adjust Stock</Link>
        <Link to="/transfer_stock" className="btn btn-secondary">Transfer Stock</Link>
      </div>

      <div>
        <h3 className="form-section-title">Recent Movements</h3>
        <DataTable
          columns={[
            { header: "Date", render: (r) => r.date, mono: true },
            { header: "Type", render: (r) => r.type },
            { header: "Location", render: (r) => r.location },
            { header: "Change", render: (r) => r.change, mono: true },
            { header: "User", render: (r) => r.user },
          ]}
          rows={RECENT_MOVEMENTS}
          keyField={(r) => `${r.date}-${r.type}`}
        />
      </div>
    </AppLayout>
  );
}