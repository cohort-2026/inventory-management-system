import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Card from "../components/Card";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { useAuth } from "../utils/AuthContext";

const attentionItems = [
  { product: "Widget A", sku: "W-001", location: "Main", qty: 12, reorder: 20, status: "low" as const },
  { product: "Widget B", sku: "W-002", location: "Main", qty: 0, reorder: 10, status: "out" as const },
];

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        subtitle={`Good morning, ${user?.username ?? ""}`}
        actions={<Button variant="secondary">Refresh</Button>}
      />

      <div className="stat-grid">
        <StatCard label="Products" value="1,245" />
        <StatCard label="Total Stock" value="8,420" />
        <StatCard label="Low Stock" value="37" />
        <StatCard label="Out of Stock" value="8" />
      </div>

      <Card title="Inventory Attention">
        <p style={{ color: 'red' }}>MOCK DATA (This is for demonstration purposes only)</p>
        <DataTable
          columns={[
            { header: "Product", render: (r) => r.product },
            { header: "SKU", render: (r) => r.sku, mono: true },
            { header: "Location", render: (r) => r.location },
            { header: "Qty", render: (r) => r.qty, mono: true },
            { header: "Reorder", render: (r) => r.reorder, mono: true },
            { header: "Status", render: (r) => <Badge status={r.status}>{r.status.toUpperCase()}</Badge> },
          ]}
          rows={attentionItems}
          keyField={(r) => r.sku}
        />
      </Card>
    </AppLayout>
  );
}