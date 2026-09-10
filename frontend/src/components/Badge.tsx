type BadgeStatus = "ok" | "low" | "out" | "info" | "progress";

export default function Badge({
  status,
  children,
}: {
  status: BadgeStatus;
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${status}`}>{children}</span>;
}