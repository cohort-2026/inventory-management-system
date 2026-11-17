
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../utils/AuthContext';
import {
  listReceipts,
  listSuppliers,
  listLocations,
  createReceipt,
  type Receipt,
  type Supplier,
  type Location
} from '../services/receivingApi';

export default function Receiving() {
  const nav = useNavigate();
  const { user } = useAuth();

  const canWrite =
    user?.roleName === 'Manager' ||
    user?.roleName === 'Inventory Staff';

  const [items, setItems] = useState<Receipt[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [note, setNote] = useState('');
  const [extra, setExtra] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);

    try {
      const [r, s, l] = await Promise.all([
        listReceipts(),
        listSuppliers(),
        listLocations()
      ]);

      setItems(r.items);
      setSuppliers(s);
      setLocations(l);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to load receipts.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function create(e: FormEvent) {
    e.preventDefault();

    if (!canWrite || busy) return;

    setBusy(true);
    setActionError('');

    try {
      const r = await createReceipt({
        supplier_id: supplierId,
        location_id: locationId,
        delivery_note: note,
        notes: extra
      });

      nav(`/receiving/${r.receipt.receipt_id}`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to create receipt.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="Goods receiving"
        subtitle="Record supplier delivery notes and post received quantities to inventory."
      />

      {canWrite && (
        <form
          className="card"
          style={{ padding: 20, marginBottom: 20 }}
          onSubmit={e => void create(e)}
        >
          <h2>Create draft GRN</h2>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 12
            }}
          >
            <label>
              Supplier *
              <select
                required
                className="field-select"
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
              >
                <option value="">Select supplier</option>

                {suppliers
                  .filter(s => s.status === 'active')
                  .map(s => (
                    <option
                      key={s.supplier_id}
                      value={s.supplier_id}
                    >
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Receiving location *
              <select
                required
                className="field-select"
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
              >
                <option value="">Select location</option>

                {locations
                  .filter(l => l.status === 'active')
                  .map(l => (
                    <option
                      key={l.location_id}
                      value={l.location_id}
                    >
                      {l.name} ({l.code})
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Supplier delivery note *
              <input
                required
                className="field-input"
                maxLength={120}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </label>

            <label>
              Notes
              <input
                className="field-input"
                maxLength={2000}
                value={extra}
                onChange={e => setExtra(e.target.value)}
              />
            </label>
          </div>

          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            disabled={busy || loading}
          >
            {busy ? 'Creating…' : 'Create draft'}
          </button>

          <p style={{ marginTop: 8 }}>
            Need a supplier? <Link to="/suppliers">Manage suppliers</Link>.
          </p>
        </form>
      )}

      {actionError && (
        <p role="alert" className="field-error">
          {actionError}
        </p>
      )}

      {loading ? (
        <p role="status">Loading receiving documents…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>

          <button
            className="btn btn-secondary"
            onClick={() => void reload()}
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p>No goods-received notes yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>GRN</th>
                <th>Supplier</th>
                <th>Delivery note</th>
                <th>Location</th>
                <th>Status</th>
                <th>Date</th>
                <th>Open</th>
              </tr>
            </thead>

            <tbody>
              {items.map(x => (
                <tr key={x.receipt_id}>
                  <td>{x.receipt_no}</td>
                  <td>{x.supplier_name}</td>
                  <td>{x.delivery_note}</td>
                  <td>{x.location_name}</td>
                  <td>{x.status}</td>
                  <td>{new Date(x.created_at).toLocaleString()}</td>
                  <td>
                    <Link
                      className="btn btn-secondary btn-sm"
                      to={`/receiving/${x.receipt_id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
