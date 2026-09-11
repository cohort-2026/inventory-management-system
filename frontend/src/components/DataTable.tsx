type Column<T> = {
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
};

export default function DataTable<T>({
  columns,
  rows,
  keyField,
  emptyMessage = "No records found.",
}: {
  columns: Column<T>[];
  rows: T[];
  keyField: (row: T) => string | number;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="table-empty">{emptyMessage}</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.header} style={{ textAlign: col.align || "left" }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={keyField(row)}>
              {columns.map((col) => (
                <td
                  key={col.header}
                  className={col.mono ? "mono" : undefined}
                  style={{ textAlign: col.align || "left" }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}