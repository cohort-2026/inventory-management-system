import AppLayout from "../components/AppLayout";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";

type Location = {
  code: string;
  name: string;
  status: "ok";
};

const LOCATIONS: Location[] = [
  { code: "MAIN", name: "Main Warehouse", status: "ok" },
  { code: "STORAGE", name: "Storage Unit", status: "ok" },
];

export default function Locations() {
  return (
    <AppLayout>
      <PageHeader title="Locations" subtitle="Storage locations used for inventory." />
      <p style={{ color: "red" }}>MOCK DATA (This is for demonstration purposes only)</p>
      <DataTable
        columns={[
          { header: "Location", render: (location) => location.name },
          { header: "Code", render: (location) => location.code, mono: true },
          {
            header: "Status",
            render: (location) => <Badge status={location.status}>ACTIVE</Badge>,
          },
        ]}
        rows={LOCATIONS}
        keyField={(location) => location.code}
        emptyMessage="No locations found."
      />
    </AppLayout>
  );
}
