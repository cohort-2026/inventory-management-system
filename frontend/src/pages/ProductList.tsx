import { useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import FilterSelect from "../components/FilterSelect";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";
import Pagination from "../components/Pagination";

type Product = {
  sku: string;
  name: string;
  category: string;
  stock: number;
  reorder: number;
  status: "ok" | "low" | "out";
};

// Mock data — swap for a fetch to GET /api/products once that route exists.
const PRODUCTS: Product[] = [
  { sku: "W-001", name: "Widget A", category: "Hardware", stock: 125, reorder: 20, status: "ok" },
  { sku: "W-002", name: "Widget B", category: "Hardware", stock: 12, reorder: 25, status: "low" },
  { sku: "W-003", name: "Widget C", category: "Tools", stock: 0, reorder: 10, status: "out" },
  { sku: "D-014", name: "Drill Set", category: "Tools", stock: 58, reorder: 15, status: "ok" },
  { sku: "C-102", name: "Cable Reel", category: "Electronics", stock: 230, reorder: 50, status: "ok" },
];

export default function ProductList() {
  const [page, setPage] = useState(1);

  return (
    <AppLayout>
      <PageHeader
        title="Products"
        actions={<Link to="/create_product" className="btn btn-primary">+ Add Product</Link>}
      />

      <SearchInput placeholder="Search by name or SKU..." />

      <div className="filter-bar" style={{ marginTop: "var(--space-3)" }}>
        <FilterSelect
          label="Category"
          options={[
            { value: "hardware", label: "Hardware" },
            { value: "tools", label: "Tools" },
            { value: "electronics", label: "Electronics" },
          ]}
        />
        <FilterSelect
          label="Status"
          options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]}
        />
        <FilterSelect
          label="Stock Status"
          options={[{ value: "ok", label: "OK" }, { value: "low", label: "Low" }, { value: "out", label: "Out" }]}
        />
        <button className="btn btn-secondary">Clear Filters</button>
      </div>

      <DataTable
        columns={[
          { header: "Product", render: (p) => <Link to={`/products/${p.sku}`}>{p.name}</Link> },
          { header: "SKU", render: (p) => p.sku, mono: true },
          { header: "Category", render: (p) => p.category },
          { header: "Stock", render: (p) => p.stock, mono: true },
          { header: "Reorder", render: (p) => p.reorder, mono: true },
          { header: "Status", render: (p) => <Badge status={p.status}>{p.status.toUpperCase()}</Badge> },
        ]}
        rows={PRODUCTS}
        keyField={(p) => p.sku}
      />

      <p className="table-note">Showing 1–{PRODUCTS.length} of 1,245</p>
      <Pagination page={page} totalPages={50} onChange={setPage} />
    </AppLayout>
  );
}