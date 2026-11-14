import type { ReactNode } from 'react';
export default function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return <div className="card" style={{ padding: 'var(--space-4)' }}><p>{message}</p>{action}</div>;
}
