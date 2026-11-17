
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../utils/AuthContext';
import {
  getReceipt,
  listProducts,
  saveLines,
  postReceipt,
  type Receipt,
  type ReceiptLine,
  type Product,
  type EditableLine
} from '../services/receivingApi';

const blank = (): EditableLine => ({
  product_id: '',
  expected_packs: '0',
  received_packs: '0',
  units_per_pack: '1',
  unit_cost: '',
  short_delivery_note: ''
});

export default function ReceivingDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const canWrite =
    user?.roleName === 'Manager' ||
    user?.roleName === 'Inventory Staff';

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [stored, setStored] = useState<ReceiptLine[]>([]);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    if (!id) return;

    setLoading(true);

    try {
      const [result, p] = await Promise.all([
        getReceipt(id),
        listProducts()
      ]);

      setReceipt(result.receipt);
      setStored(result.lines);

      setLines(
        result.lines.map(l => ({
          product_id: l.product_id,
          expected_packs: String(l.expected_packs),
          received_packs: String(l.received_packs),
          units_per_pack: String(l.units_per_pack),
          unit_cost: l.unit_cost ?? '',
          short_delivery_note: l.short_delivery_note ?? ''
        }))
      );

      setProducts(p);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to load GRN.'
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const draft = receipt?.status === 'draft';
  const editable = canWrite && draft;

  const dirty =
    JSON.stringify(lines) !==
    JSON.stringify(
      stored.map(l => ({
        product_id: l.product_id,
        expected_packs: String(l.expected_packs),
        received_packs: String(l.received_packs),
        units_per_pack: String(l.units_per_pack),
        unit_cost: l.unit_cost ?? '',
        short_delivery_note: l.short_delivery_note ?? ''
      }))
    );

  function edit(
    index: number,
    key: keyof EditableLine,
    value: string
  ) {
    setLines(old =>
      old.map((l, i) =>
        i === index ? { ...l, [key]: value } : l
      )
    );

    setNotice('');
  }

  async function save() {
    if (!editable || !id || busy) return;

    setBusy(true);
    setActionError('');
    setNotice('');

    try {
      await saveLines(
        id,
        lines.map(l => ({ ...l, unit_cost: l.unit_cost }))
      );

      await reload();
      setNotice('Draft lines saved.');
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Unable to save lines.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function post() {
    if (!editable || !id || busy || dirty) return;

    if (
      !window.confirm(
        'Post this GRN? Stock will increase immediately and the document will become read-only.'
      )
    ) {
      return;
    }

    setBusy(true);
    setActionError('');

    try {
      const result = await postReceipt(id);

      await reload();

      setNotice(
        `${result.receipt_no} posted with ${result.movements.length} receipt movements.`
      );
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Posting failed.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title={receipt?.receipt_no ?? 'Goods-received note'}
        subtitle="Supplier delivery, line quantities and permanent movement references."
      />

      <p>
        <Link to="/receiving">Back to receiving</Link>
      </p>

      {loading ? (
        <p role="status">Loading GRN…</p>
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
      ) : (
        receipt && (
          <>
            <div
              className="card"
              style={{ padding: 20, marginBottom: 20 }}
            >
              <p>
                <strong>Status:</strong> {receipt.status.toUpperCase()}
              </p>

              <p>
                <strong>Supplier:</strong> {receipt.supplier_name}
              </p>

              <p>
                <strong>Delivery note:</strong> {receipt.delivery_note}
              </p>

              <p>
                <strong>Destination:</strong> {receipt.location_name}
              </p>

              <p>
                <strong>Created:</strong>{' '}
                {new Date(receipt.created_at).toLocaleString()}
              </p>

              {receipt.posted_at && (
                <p>
                  <strong>Posted:</strong>{' '}
                  {new Date(receipt.posted_at).toLocaleString()}
                </p>
              )}
            </div>

            <h2>Received products</h2>

            <p>
              Pack quantities convert to base units. A short delivery
              requires an explanation. Zero received units do not create
              stock movements.
            </p>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Expected packs</th>
                    <th>Received packs</th>
                    <th>Units / pack</th>
                    <th>Base units</th>
                    <th>Unit cost</th>
                    <th>Short-delivery explanation</th>
                    <th>Movement</th>
                    {editable && <th>Remove</th>}
                  </tr>
                </thead>

                <tbody>
                  {(draft ? lines : stored).map((line, i) => {
                    const write = draft ? line : null;

                    const product = draft
                      ? products.find(
                          p => p.product_id === line.product_id
                        )
                      : null;

                    const received = Number(line.received_packs);
                    const expected = Number(line.expected_packs);
                    const base =
                      received * Number(line.units_per_pack);

                    return (
                      <tr
                        key={
                          draft
                            ? i
                            : (line as ReceiptLine).line_id
                        }
                      >
                        <td>
                          {editable ? (
                            <select
                              aria-label={`Product for line ${i + 1}`}
                              className="field-select"
                              value={line.product_id}
                              onChange={e =>
                                edit(i, 'product_id', e.target.value)
                              }
                            >
                              <option value="">Select product</option>

                              {products.map(p => (
                                <option
                                  key={p.product_id}
                                  value={p.product_id}
                                >
                                  {p.name} ({p.sku})
                                </option>
                              ))}
                            </select>
                          ) : write ? (
                            product?.name ??
                            products.find(
                              p => p.product_id === line.product_id
                            )?.name ??
                            'Unknown product'
                          ) : (
                            <>
                              {(line as ReceiptLine).product_name} (
                              {(line as ReceiptLine).sku})
                            </>
                          )}
                        </td>

                        {(
                          [
                            'expected_packs',
                            'received_packs',
                            'units_per_pack'
                          ] as const
                        ).map(k => (
                          <td key={k}>
                            {editable ? (
                              <input
                                className="field-input"
                                style={{
                                  minWidth: 90,
                                  width: 110
                                }}
                                type="number"
                                min={
                                  k === 'units_per_pack'
                                    ? '0.0001'
                                    : '0'
                                }
                                step="0.0001"
                                aria-label={`${k.replace('_', ' ')} for line ${i + 1}`}
                                value={line[k]}
                                onChange={e =>
                                  edit(i, k, e.target.value)
                                }
                              />
                            ) : (
                              line[k]
                            )}
                          </td>
                        ))}

                        <td>{base.toLocaleString()}</td>

                        <td>
                          {editable ? (
                            <input
                              className="field-input"
                              type="number"
                              min="0"
                              step="0.0001"
                              aria-label={`Unit cost for line ${i + 1}`}
                              value={line.unit_cost ?? ''}
                              onChange={e =>
                                edit(i, 'unit_cost', e.target.value)
                              }
                            />
                          ) : (
                            line.unit_cost ?? '—'
                          )}
                        </td>

                        <td>
                          {editable ? (
                            <input
                              className="field-input"
                              required={received < expected}
                              aria-label={`Short delivery note for line ${i + 1}`}
                              value={line.short_delivery_note ?? ''}
                              onChange={e =>
                                edit(
                                  i,
                                  'short_delivery_note',
                                  e.target.value
                                )
                              }
                            />
                          ) : (
                            line.short_delivery_note || '—'
                          )}
                        </td>

                        <td>
                          {!draft &&
                          (line as ReceiptLine).movement_id ? (
                            <Link
                              to={`/movements?reference_id=${encodeURIComponent(receipt.receipt_id)}`}
                            >
                              {(line as ReceiptLine).movement_no}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>

                        {editable && (
                          <td>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                setLines(old =>
                                  old.filter((_, j) => j !== i)
                                )
                              }
                              type="button"
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {editable && (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 16
                }}
              >
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() =>
                    setLines(old => [...old, blank()])
                  }
                >
                  Add line
                </button>

                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={
                    busy ||
                    lines.length === 0 ||
                    !dirty ||
                    lines.some(l => !l.product_id)
                  }
                  onClick={() => void save()}
                >
                  {busy ? 'Working…' : 'Save draft lines'}
                </button>

                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={
                    busy ||
                    dirty ||
                    stored.length === 0 ||
                    stored.every(
                      l => Number(l.received_packs) === 0
                    )
                  }
                  onClick={() => void post()}
                >
                  Review and Post GRN
                </button>
              </div>
            )}

            {dirty && editable && (
              <p role="status">
                Unsaved line changes. Save before posting.
              </p>
            )}

            {actionError && (
              <p className="field-error" role="alert">
                {actionError}
              </p>
            )}

            {notice && <p role="status">{notice}</p>}

            {!draft && (
              <p>
                Posted GRNs are permanently read-only. Corrections
                require separate auditable stock movements.
              </p>
            )}
          </>
        )
      )}
    </AppLayout>
  );
}
