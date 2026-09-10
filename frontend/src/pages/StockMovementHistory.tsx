import { useState } from "react";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import SearchInput from "../components/SearchInput";
import FilterSelect from "../components/FilterSelect";
import DataTable from "../components/DataTable";
import Pagination from "../components/Pagination";

type Movement = { id: string; date: string; product: string; location: string; type: string; change: string; user: string };

// Mock — swap for a fetch to GET /api/movements once that route exists.
const MOVEMENTS: Movement[] = [
  { id: "1", date: "Aug 28", product: "Widget A", location: "Main", type: "Adjustment", change: "+10", user: "John" },
  { id: "2", date: "Aug 28", product: "Widget A", location: "Main", type: "Transfer", change: "-20", user: "John" },
  { id: "3", date: "Aug 28", product: "Widget A", location: "Storage", type: "Transfer", change: "+20", user: "John" },
  { id: "4", date: "Aug 27", product: "Widget B", location: "Main", type: "Count", change: "-3", user: "Sarah" },
];

export default function StockMovementHistory() {
  const [page, setPage] = useState(1);

  return (
    <AppLayout>
      <PageHeader title="Stock Movement History" />

      <SearchInput />

      <div className="filter-bar" style={{ marginTop: "var(--space-3)" }}>
        <FilterSelect label="Product" options={[{ value: "w-001", label: "Widget A" }, { value: "w-002", label: "Widget B" }]} />
        <FilterSelect label="Location" options={[{ value: "main", label: "Main" }, { value: "storage", label: "Storage" }]} />
        <FilterSelect label="Type" options={[{ value: "adjustment", label: "Adjustment" }, { value: "transfer", label: "Transfer" }, { value: "count", label: "Count" }]} />
        <FilterSelect label="User" options={[{ value: "john", label: "John" }, { value: "sarah", label: "Sarah" }]} />
        <FilterSelect label="Date" options={[{ value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }]} />
      </div>

      <DataTable
        columns={[
          { header: "Date", render: (m) => m.date, mono: true },
          { header: "Product", render: (m) => m.product },
          { header: "Location", render: (m) => m.location },
          { header: "Type", render: (m) => m.type },
          { header: "Change", render: (m) => m.change, mono: true },
          { header: "User", render: (m) => m.user },
        ]}
        rows={MOVEMENTS}
        keyField={(m) => m.id}
      />

      <Pagination page={page} totalPages={5} onChange={setPage} />
    </AppLayout>
  );
}