import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ClipboardCheck, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../utils/AuthContext';
import { listCounts, listCountLocations } from '../services/stockCountApi';
import type { StockCount } from '../services/stockCountApi';

type QueueEntry = StockCount & { locationName: string };

/** F08 manager-only queue. The authenticated /api/counts response is authoritative. */
export default function ManagerCountReviewQueue() {
  const { user } = useAuth();
  const isManager = user?.roleName === 'Manager';
  const [items, setItems] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision(current => current + 1), []);

  useEffect(() => {
    if (!isManager) return;
    let active = true;
    setLoading(true);
    setError('');

    async function load(): Promise<void> {
      try {
        const [counts, locations] = await Promise.all([
          listCounts(),
          listCountLocations(),
        ]);
        if (!active) return;

        const locationNames = new Map(
          locations.map(location => [location.location_id, location.name]),
        );
        const pending = counts
          .filter(count => count.status === 'SUBMITTED')
          .map(count => ({
            ...count,
            locationName: locationNames.get(count.location_id) ?? 'Unknown warehouse',
          }))
          .sort((a, b) => a.created_at.localeCompare(b.created_at));

        setItems(pending);
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Unable to load the review queue.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [isManager, revision]);

  if (!isManager) return null;

  return (
    <section className="f08-review-queue" aria-labelledby="f08-review-queue-title" aria-busy={loading}>
      <div className="f08-review-queue__header">
        <div className="f08-review-queue__icon"><ShieldCheck size={22} aria-hidden="true" /></div>
        <div className="f08-review-queue__heading">
          <span className="f08-review-queue__eyebrow">MANAGER APPROVALS</span>
          <h2 id="f08-review-queue-title">Counts awaiting review</h2>
          <p>Review submitted physical counts before stock adjustments are posted.</p>
        </div>
        <button className="btn btn-secondary btn-sm" type="button" disabled={loading} onClick={refresh}>
          <RefreshCcw size={15} aria-hidden="true" /> Refresh
        </button>
      </div>

      {loading && <p className="f08-review-queue__message" role="status">Loading submitted counts…</p>}

      {!loading && error && (
        <div className="f08-review-queue__error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div><p>{error}</p><button className="btn btn-secondary btn-sm" type="button" onClick={refresh}>Try again</button></div>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="f08-review-queue__empty" role="status">
          <ClipboardCheck size={23} aria-hidden="true" />
          <div><strong>No counts awaiting approval</strong><p>Submitted stock counts will appear here.</p></div>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <p className="f08-review-queue__total">{items.length} submitted count{items.length === 1 ? '' : 's'} require review.</p>
          <div className="f08-review-queue__list">
            {items.map(count => (
              <article className="f08-review-queue__item" key={count.count_id}>
                <div className="f08-review-queue__item-main">
                  <strong>{count.count_no}</strong>
                  <span>{count.locationName}</span>
                  <small>Started {new Date(count.created_at).toLocaleString()}</small>
                </div>
                <span className="f08-review-queue__status">Submitted</span>
                <Link className="btn btn-primary btn-sm" to={`/counts/${encodeURIComponent(count.count_id)}/review`}>
                  Review count
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="f08-review-queue__footer"><Link to="/counts">View all stock counts</Link></div>
    </section>
  );
}
