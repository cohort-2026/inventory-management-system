
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import { useAuth } from '../utils/AuthContext';
import type { ProductOption, LocationOption } from '../services/api';
import {
  fetchAllTransferInventory,
  fetchTransferOptions,
  submitStockTransfer,
  fetchPendingTransfers,
  fetchTransferDetails,
  receiveStockTransfer,
  cancelStockTransfer,
  TransferApiError,
} from '../services/transferStockApi';
import type {
  TransferInventoryRow,
  TransferResult,
  PendingTransfer,
  TransferDetails,
} from '../services/transferStockApi';

type Step = 'form' | 'review' | 'done';

type FormErrors = Partial<
  Record<'product' | 'from' | 'to' | 'quantity' | 'note', string>
>;

type WriteOffReason = {
  reason_code_id: string;
  code: string;
  label: string;
  requires_note: boolean;
};

function readableError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unexpected error. Please try again.';
}

function validPositiveDecimal(text: string): boolean {
  return (
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) &&
    /[1-9]/.test(text) &&
    text.length <= 100
  );
}

function validNonNegativeDecimal(text: string): boolean {
  return (
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) &&
    text.length <= 100
  );
}

function normalizedDecimal(text: string): [string, string] {
  const [whole = '0', fraction = ''] = text.split('.');
  return [
    whole.replace(/^0+(?=\d)/, ''),
    fraction.replace(/0+$/, ''),
  ];
}

function compareDecimal(a: string, b: string): number {
  const [aw, af] = normalizedDecimal(a);
  const [bw, bf] = normalizedDecimal(b);

  if (aw.length !== bw.length) {
    return aw.length > bw.length ? 1 : -1;
  }

  if (aw !== bw) {
    return aw > bw ? 1 : -1;
  }

  const length = Math.max(af.length, bf.length);

  return af
    .padEnd(length, '0')
    .localeCompare(bf.padEnd(length, '0'));
}

function addDecimal(a: string, b: string, subtract = false): string {
  const [, af] = normalizedDecimal(a);
  const [, bf] = normalizedDecimal(b);
  const scale = Math.max(af.length, bf.length);

  const toInt = (value: string) => {
    const [whole, fraction] = normalizedDecimal(value);
    return BigInt(whole + fraction.padEnd(scale, '0'));
  };

  const result = subtract
    ? toInt(a) - toInt(b)
    : toInt(a) + toInt(b);

  const negative = result < 0n;
  const digits = (negative ? -result : result)
    .toString()
    .padStart(scale + 1, '0');

  const whole = scale ? digits.slice(0, -scale) : digits;
  const fractional = scale
    ? digits.slice(-scale).replace(/0+$/, '')
    : '';

  return `${negative ? '-' : ''}${whole}${
    fractional ? `.${fractional}` : ''
  }`;
}

async function fetchWriteOffReasons(): Promise<WriteOffReason[]> {
  const apiBase = `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api`;

  const response = await fetch(
    `${apiBase}/reason-codes?movement_type=WRITE_OFF`,
    {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
  );

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : `Unable to load write-off reasons (HTTP ${response.status}).`;

    throw new Error(message);
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('reason_codes' in payload) ||
    !Array.isArray(payload.reason_codes)
  ) {
    throw new Error('The write-off reason API returned an invalid response.');
  }

  return payload.reason_codes as WriteOffReason[];
}

export default function TransferStock() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const requestedProductId = searchParams.get('product_id') ?? '';
  const requestedFromId = searchParams.get('from_location_id') ?? '';
  const requestedToId = searchParams.get('to_location_id') ?? '';
  const requestedQuantity = searchParams.get('quantity') ?? '';

  const isManager = user?.roleName === 'Manager';
  const canReceive =
    isManager || user?.roleName === 'Inventory Staff';
  const canAccess = canReceive;

  const [step, setStep] = useState<Step>('form');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [inventory, setInventory] = useState<TransferInventoryRow[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);

  const [productId, setProductId] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<TransferResult | null>(null);

  const [selectedTransfer, setSelectedTransfer] =
    useState<TransferDetails | null>(null);
  const [writeOffReasons, setWriteOffReasons] = useState<WriteOffReason[]>([]);
  const [receivedQuantities, setReceivedQuantities] = useState<
    Record<string, string>
  >({});
  const [shortageReasons, setShortageReasons] = useState<
    Record<string, string>
  >({});
  const [shortageNotes, setShortageNotes] = useState<
    Record<string, string>
  >({});
  const [receiving, setReceiving] = useState(false);

  const submitting = useRef(false);

  const load = useCallback(
    async (reloadOptions: boolean) => {
      setLoading(true);
      setError('');

      try {
        if (reloadOptions) {
          // Save products and locations before loading pending transfers.
          // A pending-transfer failure will no longer erase product options.
          const opts = await fetchTransferOptions();

          setProducts(opts.products);
          setLocations(opts.locations);

          setProductId((current) => {
            if (
              requestedProductId &&
              opts.products.some(
                (item) => item.product_id === requestedProductId,
              )
            ) {
              return requestedProductId;
            }

            return opts.products.some(
              (item) => item.product_id === current,
            )
              ? current
              : opts.products[0]?.product_id ?? '';
          });

          setFromId((current) => {
            if (
              requestedFromId &&
              opts.locations.some(
                (item) => item.location_id === requestedFromId,
              )
            ) {
              return requestedFromId;
            }

            return opts.locations.some(
              (item) => item.location_id === current,
            )
              ? current
              : opts.locations[0]?.location_id ?? '';
          });

          setToId((current) => {
            if (
              requestedToId &&
              opts.locations.some(
                (item) => item.location_id === requestedToId,
              )
            ) {
              return requestedToId;
            }

            return opts.locations.some(
              (item) => item.location_id === current,
            )
              ? current
              : opts.locations[1]?.location_id ??
                  opts.locations[0]?.location_id ??
                  '';
          });

          if (validPositiveDecimal(requestedQuantity)) {
            setQuantity(requestedQuantity);
          }
        }

        const [records, pending] = await Promise.all([
          fetchAllTransferInventory(),
          fetchPendingTransfers(),
        ]);

        setInventory(records);
        setPendingTransfers(pending);

        return true;
      } catch (caught) {
        setError(readableError(caught));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [
      requestedProductId,
      requestedFromId,
      requestedToId,
      requestedQuantity,
    ],
  );

  useEffect(() => {
    if (!canAccess) return;

    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) {
        void load(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [canAccess, load]);

  const selectedProduct = products.find(
    (product) => product.product_id === productId,
  );

  const fromLocation = locations.find(
    (location) => location.location_id === fromId,
  );

  const toLocation = locations.find(
    (location) => location.location_id === toId,
  );

  const stockAt = (locationId: string): string =>
    inventory.find(
      (record) =>
        record.product_id === productId &&
        record.location_id === locationId,
    )?.quantity ?? '0';

  const fromBefore = stockAt(fromId);
  const amountValid = validPositiveDecimal(quantity);

  const tooMuch = Boolean(
    fromId &&
      amountValid &&
      compareDecimal(quantity, fromBefore) > 0,
  );

  const fromAfter =
    productId && fromId && amountValid && !tooMuch
      ? addDecimal(fromBefore, quantity, true)
      : '—';

  const blockingError = useMemo(() => {
    if (!products.length) return 'No active products are available.';
    if (locations.length < 2) {
      return 'Two active locations are required to dispatch stock.';
    }
    return '';
  }, [locations.length, products.length]);

  function validate(): FormErrors {
    const next: FormErrors = {};

    if (!productId || !selectedProduct) {
      next.product = 'Select a product.';
    }

    if (!fromId || !fromLocation) {
      next.from = 'Select a source location.';
    }

    if (!toId || !toLocation) {
      next.to = 'Select a destination location.';
    }

    if (fromId && toId && fromId === toId) {
      next.to = 'Source and destination must be different.';
    }

    if (!validPositiveDecimal(quantity)) {
      next.quantity = 'Enter a positive decimal quantity.';
    } else if (tooMuch) {
      next.quantity = `Cannot dispatch ${quantity}; only ${fromBefore} in stock at this location.`;
    }

    if (note.trim().length > 2000) {
      next.note = 'Notes must be 2,000 characters or fewer.';
    }

    return next;
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const next = validate();
    setErrors(next);

    if (Object.keys(next).length) return;

    const loaded = await load(false);
    if (!loaded) return;

    setStep('review');
  }

  async function confirmDispatch() {
    if (!isManager || submitting.current || saving || loading) return;

    submitting.current = true;
    setSaving(true);
    setError('');

    try {
      const result = await submitStockTransfer({
        product_id: productId,
        from_location_id: fromId,
        to_location_id: toId,
        quantity,
        note: note.trim() || null,
      });

      setSuccess(result);
      setStep('done');
      await load(false);
    } catch (caught) {
      const message = readableError(caught);
      setError(message);

      if (caught instanceof TransferApiError && caught.status === 409) {
        try {
          setInventory(await fetchAllTransferInventory());
        } catch (refreshError) {
          setError(
            `${message} Stock refresh failed: ${readableError(refreshError)}`,
          );
        }
      }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  async function openTransfer(transferId: string) {
    setError('');
    setReceiving(true);

    try {
      const [details, reasons] = await Promise.all([
        fetchTransferDetails(transferId),
        fetchWriteOffReasons(),
      ]);

      setSelectedTransfer(details);
      setWriteOffReasons(reasons);

      const initialQuantities: Record<string, string> = {};
      const initialReasons: Record<string, string> = {};
      const initialNotes: Record<string, string> = {};

      for (const line of details.lines) {
        initialQuantities[line.transfer_line_id] = line.quantity_sent;
        initialReasons[line.transfer_line_id] =
          line.shortage_reason_code_id ?? '';
        initialNotes[line.transfer_line_id] = line.shortage_note ?? '';
      }

      setReceivedQuantities(initialQuantities);
      setShortageReasons(initialReasons);
      setShortageNotes(initialNotes);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setReceiving(false);
    }
  }

  async function confirmReceipt() {
    if (!selectedTransfer || receiving) return;

    const lines = selectedTransfer.lines;
    const bodyLines: Array<{
      product_id: string;
      quantity_received: string;
      shortage_reason_code_id: string | null;
      shortage_note: string | null;
    }> = [];

    for (const line of lines) {
      const id = line.transfer_line_id;
      const received = receivedQuantities[id] ?? '';

      if (!validNonNegativeDecimal(received)) {
        setError(`Enter a valid received quantity for ${line.product_name}.`);
        return;
      }

      if (compareDecimal(received, line.quantity_sent) > 0) {
        setError(
          `Received quantity for ${line.product_name} cannot exceed the sent quantity.`,
        );
        return;
      }

      const isShort = compareDecimal(received, line.quantity_sent) < 0;
      const reasonId = shortageReasons[id] ?? '';
      const reason = writeOffReasons.find(
        (item) => item.reason_code_id === reasonId,
      );
      const shortageNote = (shortageNotes[id] ?? '').trim();

      if (isShort && !reason) {
        setError(`Select a write-off reason for ${line.product_name}.`);
        return;
      }

      if (isShort && !shortageNote) {
        setError(`Enter a note for the shortage of ${line.product_name}.`);
        return;
      }

      bodyLines.push({
        product_id: line.product_id,
        quantity_received: received,
        shortage_reason_code_id: isShort ? reasonId : null,
        shortage_note: isShort ? shortageNote : null,
      });
    }

    setReceiving(true);
    setError('');

    try {
      await receiveStockTransfer(selectedTransfer.transfer_id, {
        lines: bodyLines,
      });

      setSelectedTransfer(null);
      setReceivedQuantities({});
      setShortageReasons({});
      setShortageNotes({});
      await load(false);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setReceiving(false);
    }
  }

  async function cancelTransfer(transferId: string) {
    if (!isManager || receiving) return;

    const confirmed = window.confirm(
      'Cancel this in-transit transfer? The dispatched stock will be returned to the source location.',
    );

    if (!confirmed) return;

    setReceiving(true);
    setError('');

    try {
      await cancelStockTransfer(transferId);
      setSelectedTransfer(null);
      await load(false);
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setReceiving(false);
    }
  }

  if (!canAccess) {
    return (
      <AppLayout>
        <PageHeader title="Transfer Stock" />
        <p role="alert" className="field-error">
          You do not have permission to access stock transfers.
        </p>
        <Link to="/inventory_overview" className="btn btn-secondary">
          Return to inventory
        </Link>
      </AppLayout>
    );
  }

  const fieldError = (field: keyof FormErrors) => errors[field];

  return (
    <AppLayout>
      <PageHeader
        title="Transfer Stock"
        subtitle="Dispatch stock between locations, then confirm what was received."
      />

      {error && (
        <p
          role="alert"
          className="field-error"
          style={{ marginBottom: 'var(--space-4)' }}
        >
          {error}
        </p>
      )}

      {loading && <p role="status">Loading transfers and inventory…</p>}

      {!loading && (
        <>
          {canReceive && (
            <section style={{ marginBottom: 'var(--space-5)' }}>
              <Card title="Transfers to receive">
                {pendingTransfers.length === 0 ? (
                  <p className="field-hint">
                    There are currently no transfers waiting to be received.
                  </p>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Transfer</th>
                          <th>From</th>
                          <th>To</th>
                          <th>Items</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingTransfers.map((transfer) => (
                          <tr key={transfer.transfer_id}>
                            <td>
                              <strong>{transfer.transfer_no}</strong>
                            </td>
                            <td>{transfer.from_location_name}</td>
                            <td>{transfer.to_location_name}</td>
                            <td>{transfer.line_count}</td>
                            <td>{transfer.status}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={receiving}
                                onClick={() =>
                                  void openTransfer(transfer.transfer_id)
                                }
                              >
                                Receive
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </section>
          )}

          {selectedTransfer && (
            <section
              className="card"
              aria-label="Receive stock transfer"
              style={{ marginBottom: 'var(--space-5)' }}
            >
              <div className="card-body">
                <h2 className="form-section-title">
                  Receive transfer {selectedTransfer.transfer_no}
                </h2>

                <p>
                  <strong>From:</strong> {selectedTransfer.from_location_name}
                </p>
                <p>
                  <strong>To:</strong> {selectedTransfer.to_location_name}
                </p>

                {selectedTransfer.note && (
                  <p>
                    <strong>Dispatch note:</strong> {selectedTransfer.note}
                  </p>
                )}

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Sent</th>
                        <th>Received</th>
                        <th>Shortage reason</th>
                        <th>Shortage note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransfer.lines.map((line) => {
                        const id = line.transfer_line_id;
                        const received =
                          receivedQuantities[id] ?? line.quantity_sent;
                        const isShort =
                          validNonNegativeDecimal(received) &&
                          compareDecimal(received, line.quantity_sent) < 0;

                        return (
                          <tr key={id}>
                            <td>
                              <strong>{line.product_name}</strong>
                              <div className="field-hint">
                                {line.product_sku} · {line.unit_of_measure}
                              </div>
                            </td>
                            <td className="mono">{line.quantity_sent}</td>
                            <td>
                              <input
                                className="field-input"
                                type="text"
                                inputMode="decimal"
                                value={received}
                                disabled={receiving}
                                onChange={(event) =>
                                  setReceivedQuantities((current) => ({
                                    ...current,
                                    [id]: event.target.value,
                                  }))
                                }
                                aria-label={`Quantity received for ${line.product_name}`}
                              />
                            </td>
                            <td>
                              {isShort ? (
                                <select
                                  className="field-select"
                                  value={shortageReasons[id] ?? ''}
                                  disabled={receiving}
                                  onChange={(event) =>
                                    setShortageReasons((current) => ({
                                      ...current,
                                      [id]: event.target.value,
                                    }))
                                  }
                                  aria-label={`Shortage reason for ${line.product_name}`}
                                >
                                  <option value="">Select reason</option>
                                  {writeOffReasons.map((reason) => (
                                    <option
                                      key={reason.reason_code_id}
                                      value={reason.reason_code_id}
                                    >
                                      {reason.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="field-hint">Not required</span>
                              )}
                            </td>
                            <td>
                              {isShort ? (
                                <input
                                  className="field-input"
                                  type="text"
                                  maxLength={2000}
                                  value={shortageNotes[id] ?? ''}
                                  disabled={receiving}
                                  onChange={(event) =>
                                    setShortageNotes((current) => ({
                                      ...current,
                                      [id]: event.target.value,
                                    }))
                                  }
                                  aria-label={`Shortage note for ${line.product_name}`}
                                />
                              ) : (
                                <span className="field-hint">Not required</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="field-hint">
                  Enter the actual quantity received for each product. A
                  quantity below the sent amount requires a write-off reason
                  and note. You cannot receive more than was dispatched.
                </p>

                <div className="page-actions" style={{ flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={receiving}
                    onClick={() => setSelectedTransfer(null)}
                  >
                    Close
                  </button>

                  {isManager && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={receiving}
                      onClick={() =>
                        void cancelTransfer(selectedTransfer.transfer_id)
                      }
                    >
                      Cancel transfer
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={receiving}
                    onClick={() => void confirmReceipt()}
                  >
                    {receiving ? 'Processing…' : 'Confirm receipt'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {isManager && (
            <>
              <div
                aria-label="Transfer progress"
                className="field-hint"
                style={{ marginBottom: 'var(--space-4)' }}
              >
                {step === 'form'
                  ? 'Step 1 — Dispatch stock'
                  : step === 'review'
                    ? 'Review dispatch'
                    : 'Dispatch complete'}
              </div>

              {blockingError && step !== 'done' && (
                <p role="alert" className="field-error">
                  {blockingError}
                </p>
              )}

              {step === 'form' && !blockingError && (
                <div className="form-with-sidebar transfer-stock-page">
                  <form
                    className="stock-movement-form"
                    onSubmit={(event) => void review(event)}
                    noValidate
                  >
                    <div className="field">
                      <label className="field-label" htmlFor="transfer-product">
                        Product *
                      </label>
                      <select
                        id="transfer-product"
                        className="field-select"
                        value={productId}
                        onChange={(event) => {
                          setProductId(event.target.value);
                          setErrors({});
                        }}
                        aria-invalid={Boolean(fieldError('product'))}
                        required
                      >
                        <option value="">Select a product</option>
                        {products.map((product) => (
                          <option
                            key={product.product_id}
                            value={product.product_id}
                          >
                            {product.name} ({product.sku})
                          </option>
                        ))}
                      </select>
                      {fieldError('product') && (
                        <p className="field-error" role="alert">
                          {fieldError('product')}
                        </p>
                      )}
                    </div>

                    <div className="field-row">
                      <div className="field">
                        <label className="field-label" htmlFor="transfer-from">
                          From location *
                        </label>
                        <select
                          id="transfer-from"
                          className="field-select"
                          value={fromId}
                          onChange={(event) => {
                            setFromId(event.target.value);
                            setErrors({});
                          }}
                          aria-invalid={Boolean(fieldError('from'))}
                          required
                        >
                          <option value="">Select source</option>
                          {locations.map((location) => (
                            <option
                              key={location.location_id}
                              value={location.location_id}
                            >
                              {location.name}
                            </option>
                          ))}
                        </select>
                        {fieldError('from') && (
                          <p className="field-error" role="alert">
                            {fieldError('from')}
                          </p>
                        )}
                      </div>

                      <div className="field">
                        <label className="field-label" htmlFor="transfer-to">
                          To location *
                        </label>
                        <select
                          id="transfer-to"
                          className="field-select"
                          value={toId}
                          onChange={(event) => {
                            setToId(event.target.value);
                            setErrors({});
                          }}
                          aria-invalid={Boolean(fieldError('to'))}
                          required
                        >
                          <option value="">Select destination</option>
                          {locations.map((location) => (
                            <option
                              key={location.location_id}
                              value={location.location_id}
                            >
                              {location.name}
                            </option>
                          ))}
                        </select>
                        {fieldError('to') && (
                          <p className="field-error" role="alert">
                            {fieldError('to')}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="field-hint">
                      Available at source:{' '}
                      <span className="mono">
                        {productId && fromId ? fromBefore : '—'}
                      </span>
                    </p>

                    <div className="field">
                      <label
                        className="field-label"
                        htmlFor="transfer-quantity"
                      >
                        Quantity *
                      </label>
                      <input
                        id="transfer-quantity"
                        className="field-input"
                        type="text"
                        inputMode="decimal"
                        value={quantity}
                        onChange={(event) => {
                          setQuantity(event.target.value);
                          setErrors({});
                        }}
                        aria-invalid={Boolean(fieldError('quantity'))}
                        required
                      />
                      <p className="field-hint">
                        Enter a positive quantity. Decimals are supported.
                      </p>
                      {fieldError('quantity') && (
                        <p className="field-error" role="alert">
                          {fieldError('quantity')}
                        </p>
                      )}
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="transfer-note">
                        Note (optional)
                      </label>
                      <textarea
                        id="transfer-note"
                        className="field-textarea"
                        maxLength={2000}
                        value={note}
                        onChange={(event) => {
                          setNote(event.target.value);
                          setErrors({});
                        }}
                      />
                      {fieldError('note') && (
                        <p className="field-error" role="alert">
                          {fieldError('note')}
                        </p>
                      )}
                    </div>

                    <div className="page-actions" style={{ flexWrap: 'wrap' }}>
                      <Link
                        to="/inventory_overview"
                        className="btn btn-secondary"
                      >
                        Cancel
                      </Link>
                      <button className="btn btn-primary" type="submit">
                        Review dispatch
                      </button>
                    </div>
                  </form>

                  <Card title="Dispatch preview">
                    <div className="transfer-box">
                      <p className="transfer-box-label">
                        {fromLocation?.name ?? 'Source location'}
                      </p>
                      <p className="transfer-box-value">
                        {productId && fromId ? fromBefore : '—'} → {fromAfter}
                      </p>
                    </div>

                    <p className="transfer-arrow">↓</p>

                    <div className="transfer-box">
                      <p className="transfer-box-label">Stock in Transit</p>
                      <p className="transfer-box-value">
                        {amountValid ? quantity : '—'}
                      </p>
                    </div>

                    <p className="field-hint">
                      Destination stock only increases after the receiving
                      location confirms the quantities received.
                    </p>

                    {tooMuch && (
                      <p className="field-error" role="alert">
                        Only {fromBefore} available at the source.
                      </p>
                    )}
                  </Card>
                </div>
              )}

              {step === 'review' && (
                <div className="transfer-review-layout transfer-stock-page">
                  <section className="card" aria-label="Review dispatch">
                    <div className="card-body">
                      <h2 className="form-section-title">
                        Review before dispatch
                      </h2>

                      <p>
                        <strong>Product:</strong> {selectedProduct?.name} (
                        {selectedProduct?.sku})
                      </p>
                      <p>
                        <strong>Quantity:</strong>{' '}
                        <span className="mono">{quantity}</span>
                      </p>
                      <p>
                        <strong>From:</strong> {fromLocation?.name}
                      </p>
                      <p>
                        <strong>To:</strong> {toLocation?.name}
                      </p>
                      {note.trim() && (
                        <p>
                          <strong>Note:</strong> {note.trim()}
                        </p>
                      )}

                      <div
                        className="transfer-box"
                        style={{ marginTop: 'var(--space-4)' }}
                      >
                        <p className="transfer-box-label">
                          Source — {fromLocation?.name}
                        </p>
                        <p className="transfer-box-value">
                          {fromBefore} → {fromAfter}
                        </p>
                      </div>

                      <div className="transfer-box">
                        <p className="transfer-box-label">Stock in Transit</p>
                        <p className="transfer-box-value">+{quantity}</p>
                      </div>

                      <p className="field-hint">
                        Dispatch deducts stock from the source and places it
                        in Stock in Transit. The destination is credited only
                        after receipt is confirmed.
                      </p>

                      {tooMuch && (
                        <p role="alert" className="field-error">
                          Stock has changed. Only {fromBefore} is currently
                          available. Go back and revise the quantity.
                        </p>
                      )}

                      <div className="page-actions" style={{ flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          disabled={saving || loading}
                          onClick={() => {
                            setStep('form');
                            setError('');
                          }}
                        >
                          Back
                        </button>
                        <button
                          className="btn btn-primary"
                          type="button"
                          disabled={saving || loading || tooMuch}
                          onClick={() => void confirmDispatch()}
                        >
                          {saving ? 'Dispatching…' : 'Confirm dispatch'}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {step === 'done' && success && (
                <section className="card" aria-label="Dispatch confirmation">
                  <div className="card-body">
                    <h2 className="form-section-title">
                      Stock dispatched successfully
                    </h2>

                    <p role="status">
                      Transfer <strong>{success.transfer_no}</strong> is now{' '}
                      <strong>IN_TRANSIT</strong>.
                    </p>

                    <p>
                      <strong>Quantity dispatched:</strong>{' '}
                      <span className="mono">{success.quantity_sent}</span>
                    </p>
                    <p>
                      <strong>Destination:</strong> {toLocation?.name}
                    </p>

                    <p className="field-hint">
                      Transfer reference:{' '}
                      <span className="mono">{success.transfer_no}</span>
                    </p>
                    <p className="field-hint">
                      The destination must confirm receipt before its
                      inventory is increased.
                    </p>

                    <div
                      className="page-actions"
                      style={{
                        flexWrap: 'wrap',
                        marginTop: 'var(--space-4)',
                      }}
                    >
                      <Link
                        to="/inventory_overview"
                        className="btn btn-primary"
                      >
                        View inventory
                      </Link>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => {
                          setStep('form');
                          setSuccess(null);
                          setQuantity('');
                          setNote('');
                          void load(false);
                        }}
                      >
                        New dispatch
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </AppLayout>
  );
}
