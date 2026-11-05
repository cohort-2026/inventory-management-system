import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import Pagination from "../components/Pagination";
import SearchInput from "../components/SearchInput";

type Row = {
  id: string;
  product: string;
  sku: string;
  location: string;
  onHand: number;
  reorder: number;
  status: "ok" | "low" | "out";
};

const ROWS: Row[] = [
  { id: "1", product: "Widget A", sku: "W-001", location: "Main", onHand: 125, reorder: 20, status: "ok" },
  { id: "2", product: "Widget A", sku: "W-001", location: "Storage", onHand: 15, reorder: 20, status: "low" },
  { id: "3", product: "Widget B", sku: "W-002", location: "Main", onHand: 0, reorder: 10, status: "out" },
];

const PAGE_SIZE = 10;

export default function InventoryOverviewExample() {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const locations = useMemo(
    () => [...new Set(ROWS.map((row) => row.location))].sort(),
    [],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return ROWS.filter((row) => {
      const matchesSearch =
        !query ||
        row.product.toLowerCase().includes(query) ||
        row.sku.toLowerCase().includes(query);

      return (
        matchesSearch &&
        (!location || row.location === location) &&
        (!status || row.status === status)
      );
    });
  }, [search, location, status]);

  useEffect(() => {
    setPage(1);
  }, [search, location, status]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = [
    { label: "Unique products", value: new Set(ROWS.map((row) => row.sku)).size },
    { label: "In stock", value: ROWS.filter((row) => row.status === "ok").length },
    { label: "Low stock", value: ROWS.filter((row) => row.status === "low").length },
    { label: "Out of stock", value: ROWS.filter((row) => row.status === "out").length },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Inventory Overview"
        subtitle="Review stock levels by product and location."
        actions={
          <>
            <Link to="/adjust_stock" className="btn btn-primary">Adjust</Link>
            <Link to="/transfer_stock" className="btn btn-secondary">Transfer</Link>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {summary.map((item) => (
          <div className="stat-card" key={item.label}>
            <span className="stat-label">{item.label}</span>
            <span className="stat-value">{item.value}</span>
          </div>
        ))}
      </div>

      <SearchInput
        placeholder="Search product or SKU..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div className="filter-bar">
        <select
          className="filter-select"
          aria-label="Filter by location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        >
          <option value="">All locations</option>
          {locations.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>

        <select
          className="filter-select"
          aria-label="Filter by stock status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All stock statuses</option>
          <option value="ok">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
      </div>

      <DataTable
        columns={[
          { header: "Product", render: (row: Row) => row.product },
          { header: "SKU", render: (row: Row) => row.sku, mono: true },
          { header: "Location", render: (row: Row) => row.location },
          { header: "On Hand", render: (row: Row) => row.onHand, mono: true },
          { header: "Reorder Level", render: (row: Row) => row.reorder, mono: true },
          {
            header: "Status",
            render: (row: Row) => (
              <Badge status={row.status}>
                {row.status === "ok" ? "IN STOCK" : row.status.toUpperCase()}
              </Badge>
            ),
          },
        ]}
        rows={pageRows}
        keyField={(row: Row) => row.id}
        emptyMessage="No inventory matches these filters."
      />

      <p className="table-note">Matching records: {filteredRows.length}</p>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </AppLayout>
  );
}
 