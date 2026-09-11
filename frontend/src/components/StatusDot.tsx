import "../App.css";

type DotStatus = "ok" | "warn" | "pending";

const SYMBOL: Record<DotStatus, string> = { ok: "✓", warn: "!", pending: "" };

export default function StatusDot({ status }: { status: DotStatus }) {
  return <span className={`status-dot status-dot-${status}`}>{SYMBOL[status]}</span>;
}