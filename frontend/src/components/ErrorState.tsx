export default function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="card" style={{ padding: 'var(--space-4)' }}><p>{message}</p>{onRetry && <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>}</div>;
}
