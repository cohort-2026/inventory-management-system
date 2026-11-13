export default function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return <div role="status" aria-live="polite" className="card" style={{ padding: 'var(--space-4)' }}>{message}</div>;
}
