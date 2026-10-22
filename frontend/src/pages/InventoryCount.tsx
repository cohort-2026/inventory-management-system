import { useEffect, useState } from "react";
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

const COUNT_STORAGE_KEY = "inventory-count-CNT-001";

type SavedCount = {
  lines: CountLine[];
  completed: boolean;
};

function isSavedCount(value: unknown): value is SavedCount {
  if (typeof value !== "object" || value === null || !("lines" in value) || !("completed" in value)) {
    return false;
  }

  const saved = value as { lines: unknown; completed: unknown };
  if (typeof saved.completed !== "boolean" || !Array.isArray(saved.lines) || saved.lines.length !== INITIAL_LINES.length) {
    return false;
  }

  return saved.lines.every((line: unknown, index: number) => {
    if (typeof line !== "object" || line === null) return false;
    const candidate = line as Partial<CountLine>;
    return (
      candidate.sku === INITIAL_LINES[index]?.sku &&
      candidate.product === INITIAL_LINES[index]?.product &&
      candidate.recorded === INITIAL_LINES[index]?.recorded &&
      (candidate.counted === null ||
        (typeof candidate.counted === "number" &&
          Number.isFinite(candidate.counted) &&
          candidate.counted >= 0))
    );
  });
}

export default function InventoryCount() {
  const [lines, setLines] = useState(INITIAL_LINES);
  const [completed, setCompleted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const savedCount = localStorage.getItem(COUNT_STORAGE_KEY);
      if (savedCount === null) return;

      const parsed: unknown = JSON.parse(savedCount);
      if (!isSavedCount(parsed)) {
        setError("Saved count data is invalid. You can replace it by saving new progress.");
        return;
      }

      setLines(parsed.lines);
      setCompleted(parsed.completed);
    } catch {
      setError("Could not load saved count progress from this browser.");
    }
  }, []);

  function updateCounted(sku: string, value: string) {
    const counted = value === "" ? null : Number(value);
    if (counted !== null && (!Number.isFinite(counted) || counted < 0)) return;
    setLines((prev) => prev.map((line) => (line.sku === sku ? { ...line, counted } : line)));
  }

  function statusFor(line: CountLine): "ok" | "warn" | "pending" {
    if (line.counted === null) return "pending";
    return line.counted === line.recorded ? "ok" : "warn";
  }

  function saveCount(isComplete: boolean): boolean {
    try {
      localStorage.setItem(
        COUNT_STORAGE_KEY,
        JSON.stringify({ lines, completed: isComplete } satisfies SavedCount),
      );
      return true;
    } catch {
      setError("Could not save count progress in this browser.");
      setMessage("");
      return false;
    }
  }

  function handleSaveProgress() {
    setError("");
    if (saveCount(false)) {
      setCompleted(false);
      setMessage("Progress saved in this browser.");
    }
  }

  function handleComplete() {
    setError("");
    setMessage("");

    const uncountedLines = lines.filter((line) => line.counted === null);
    if (uncountedLines.length > 0) {
      setError(`Enter a counted quantity for every product before completing. ${uncountedLines.length} product(s) remain.`);
      return;
    }

    if (saveCount(true)) {
      setCompleted(true);
      setMessage("Count completed and saved in this browser.");
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="Count CNT-001"
        subtitle="Main Warehouse"
        actions={
          <Badge status={completed ? "ok" : "progress"}>
            {completed ? "COMPLETED" : "IN PROGRESS"}
          </Badge>
        }
      />

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
                      min={0}
                      step={1}
                      value={line.counted ?? ""}
                      disabled={completed}
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

      {message && <p role="status">{message}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="page-actions" style={{ marginTop: "var(--space-4)", justifyContent: "space-between" }}>
        <button className="btn btn-secondary" type="button" disabled={completed} onClick={handleSaveProgress}>
          Save Progress
        </button>
        <button className="btn btn-primary" type="button" disabled={completed} onClick={handleComplete}>
          Complete Count
        </button>
      </div>
    </AppLayout>
  );
}