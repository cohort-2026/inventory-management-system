import { useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import FilterSelect from "../components/FilterSelect";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";
import Pagination from "../components/Pagination";

type Row = {
  id: string;
  product: string;
  sku: string;
  location: string;
  onHand: number;
  reorder: number;
  status: "ok" | "low" | "out";
};

// Mock — swap for a fetch to GET /api/inventory once that route exists.
const ROWS: Row[] = [
  { id: "1", product: "Widget A", sku: "W-001", location: "Main", onHand: 125, reorder: 20, status: "ok" },
  { id: "2", product: "Widget A", sku: "W-001", location: "Storage", onHand: 15, reorder: 20, status: "low" },
  { id: "3", product: "Widget B", sku: "W-002", location: "Main", onHand: 0, reorder: 10, status: "out" },
];

export default function InventoryOverview() {
  const [page, setPage] = useState(1);

  return (
    <AppLayout>
      <PageHeader
        title="Inventory"
        actions={
          <>
            <Link to="/adjust_stock" className="btn btn-primary">Adjust</Link>
            <Link to="/transfer_stock" className="btn btn-secondary">Transfer</Link>
          </>
        }
      />

      <SearchInput placeholder="Search product, SKU..." />

      <div className="filter-bar" style={{ marginTop: "var(--space-3)" }}>
        <FilterSelect label="Location" options={[{ value: "main", label: "Main" }, { value: "storage", label: "Storage" }]} />
        <FilterSelect label="Category" options={[{ value: "hardware", label: "Hardware" }]} />
        <FilterSelect label="Stock Status" options={[{ value: "ok", label: "OK" }, { value: "low", label: "Low" }, { value: "out", label: "Out" }]} />
      </div>

      <DataTable
        columns={[
          { header: "Product", render: (r) => r.product },
          { header: "SKU", render: (r) => r.sku, mono: true },
          { header: "Location", render: (r) => r.location },
          { header: "On Hand", render: (r) => r.onHand, mono: true },
          { header: "Reorder", render: (r) => r.reorder, mono: true },
          { header: "Status", render: (r) => <Badge status={r.status}>{r.status.toUpperCase()}</Badge> },
        ]}
        rows={ROWS}
        keyField={(r) => r.id}
      />

      <p className="table-note">Total records: {ROWS.length}</p>
      <p className="table-note">Note: a product can appear more than once — inventory is location-specific.</p>
      <Pagination page={page} totalPages={3} onChange={setPage} />
    </AppLayout>
  );
}