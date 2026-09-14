import { useState } from "react";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import Badge from "../components/Badge";
import StatusDot from "../components/StatusDot";

type CountLine = { sku: string; product: string; recorded: number; counted: number | null };

// Mock — swap for a fetch to GET /api/counts/:id once that route exists.
const INITIAL_LINES: CountLine[] = [
  { sku: "W-001", product: "Widget A", recorded: 125, counted: 125 },
  { sku: "W-002", product: "Widget B", recorded: 50, counted: 47 },
  { sku: "W-003", product: "Widget C", recorded: 20, counted: null },
];

export default function InventoryCount() {
  const [lines, setLines] = useState(INITIAL_LINES);

  function updateCounted(sku: string, value: string) {
    const counted = value === "" ? null : Number(value);
    setLines((prev) => prev.map((line) => (line.sku === sku ? { ...line, counted } : line)));
  }

  function statusFor(line: CountLine): "ok" | "warn" | "pending" {
    if (line.counted === null) return "pending";
    return line.counted === line.recorded ? "ok" : "warn";
  }

  function handleComplete() {
    // TODO: POST to /api/counts/:id/complete once that route exists.
  }

  return (
    <AppLayout>
      <PageHeader title="Count CNT-001" subtitle="Main Warehouse" actions={<Badge status="progress">IN PROGRESS</Badge>} />

      <SearchInput placeholder="Search products..." />

      <p style={{ color: 'red' }}>MOCK DATA (This is for demonstration purposes only)</p>
      <div className="table-wrap" style={{ marginTop: "var(--space-4)" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th><th>SKU</th><th>Recorded</th><th>Counted</th><th>Difference</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const difference = line.counted === null ? null : line.counted - line.recorded;
              return (
                <tr key={line.sku}>
                  <td>{line.product}</td>
                  <td className="mono">{line.sku}</td>
                  <td className="mono">{line.recorded}</td>
                  <td>
                    <input
                      className="field-input"
                      style={{ maxWidth: 90 }}
                      type="number"
                      value={line.counted ?? ""}
                      onChange={(e) => updateCounted(line.sku, e.target.value)}
                    />
                  </td>
                  <td className="mono">{difference === null ? "—" : difference}</td>
                  <td><StatusDot status={statusFor(line)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="page-actions" style={{ marginTop: "var(--space-4)", justifyContent: "space-between" }}>
        <button className="btn btn-secondary">Save Progress</button>
        <button className="btn btn-primary" onClick={handleComplete}>Complete Count</button>
      </div>
    </AppLayout>
  );
}