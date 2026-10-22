import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";

type MovementSummary = {
  date: string;
  product: string;
  location: string;
  movement: string;
  change: string;
};

const RECENT_MOVEMENTS: MovementSummary[] = [
  { date: "Aug 28", product: "Widget A", location: "Main", movement: "Adjustment", change: "+10" },
  { date: "Aug 28", product: "Widget A", location: "Main", movement: "Transfer", change: "-20" },
  { date: "Aug 28", product: "Widget A", location: "Storage", movement: "Transfer", change: "+20" },
  { date: "Aug 27", product: "Widget B", location: "Main", movement: "Count", change: "-3" },
];

export default function Reports() {
  return (
    <AppLayout>
      <PageHeader
        title="Reports"
        subtitle="Inventory and stock movement summary."
        actions={<Link to="/stock_movement_history" className="btn btn-secondary">Full movement history</Link>}
      />

      <p style={{ color: "red" }}>MOCK DATA (This is for demonstration purposes only)</p>

      <div className="stat-grid">
        <StatCard label="Products" value="1,245" />
        <StatCard label="Total Stock" value="8,420" />
        <StatCard label="Low Stock" value="37" />
        <StatCard label="Out of Stock" value="8" />
      </div>

      <h2 className="form-section-title">Recent Stock Movements</h2>
      <DataTable
        columns={[
          { header: "Date", render: (movement) => movement.date, mono: true },
          { header: "Product", render: (movement) => movement.product },
          { header: "Location", render: (movement) => movement.location },
          { header: "Movement", render: (movement) => movement.movement },
          { header: "Change", render: (movement) => movement.change, mono: true },
        ]}
        rows={RECENT_MOVEMENTS}
        keyField={(movement) => `${movement.date}-${movement.product}-${movement.location}-${movement.movement}`}
      />
    </AppLayout>
  );
}
