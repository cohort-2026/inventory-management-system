
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent
} from 'react';

import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../utils/AuthContext';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  type Supplier
} from '../services/receivingApi';

export default function Suppliers() {
  const { user } = useAuth();
  const canWrite =
    user?.roleName === 'Manager' ||
    user?.roleName === 'Inventory Staff';

  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);

    try {
      setItems(await listSuppliers());
      setError('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to load suppliers.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function add(e: FormEvent) {
    e.preventDefault();

    if (!canWrite || busy) return;

    setBusy(true);
    setActionError('');

    try {
      await createSupplier({
        supplier_code: code,
        name,
        contact_name: contact,
        email,
        phone
      });

      setCode('');
      setName('');
      setContact('');
      setEmail('');
      setPhone('');

      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Unable to add supplier.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: Supplier) {
    if (!canWrite || busy) return;

    setBusy(true);
    setActionError('');

    try {
      await updateSupplier(s.supplier_id, {
        status: s.status === 'active' ? 'inactive' : 'active'
      });

      await reload();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Unable to update supplier.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="Suppliers"
        subtitle="Maintain supplier records used by goods-received notes."
      />

      {canWrite && (
        <form
          className="card"
          style={{ padding: 20, marginBottom: 20 }}
          onSubmit={e => void add(e)}
        >
          <h2 style={{ marginBottom: 12 }}>Add supplier</h2>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12
            }}
          >
            <label>
              Supplier code *
              <input
                className="field-input"
                required
                maxLength={40}
                value={code}
                onChange={e => setCode(e.target.value)}
              />
            </label>

            <label>
              Name *
              <input
                className="field-input"
                required
                maxLength={200}
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>

            <label>
              Contact
              <input
                className="field-input"
                maxLength={160}
                value={contact}
                onChange={e => setContact(e.target.value)}
              />
            </label>

            <label>
              Email
              <input
                className="field-input"
                type="email"
                maxLength={254}
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            <label>
              Phone
              <input
                className="field-input"
                maxLength={60}
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </label>
          </div>

          <button
            className="btn btn-primary"
            style={{ marginTop: 12 }}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Create supplier'}
          </button>
        </form>
      )}

      {actionError && (
        <p role="alert" className="field-error">
          {actionError}
        </p>
      )}

      {loading ? (
        <p role="status">Loading suppliers…</p>
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
        <p>No suppliers yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier code</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Status</th>
                {canWrite && <th>Action</th>}
              </tr>
            </thead>

            <tbody>
              {items.map(s => (
                <tr key={s.supplier_id}>
                  <td>{s.supplier_code}</td>
                  <td>{s.name}</td>
                  <td>{s.contact_name || '—'}</td>
                  <td>{s.email || '—'}</td>
                  <td>{s.status}</td>

                  {canWrite && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => void toggle(s)}
                      >
                        {s.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
