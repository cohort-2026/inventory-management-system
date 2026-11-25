
import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import {
  fetchPendingTransfers,
  fetchTransferDetails,
  receiveStockTransfer,
} from '../services/transferStockApi';
import type {
  PendingTransfer,
  TransferDetails,
} from '../services/transferStockApi';

const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api`;

type ReasonCode = {
  reason_code_id: string;
  code: string;
  description: string;
};

type ReceiptLineInput = {
  quantity_received: string;
  shortage_reason_code_id: string;
  shortage_note: string;
};

function normalizeDecimal(value: string | number): string {
  const stringValue = String(value ?? '0');
  const [whole = '0', fraction = ''] = stringValue.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction.replace(/0+$/, '');

  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
}

function compareDecimal(
  first: string | number,
  second: string | number,
): number {
  const a = normalizeDecimal(first);
  const b = normalizeDecimal(second);

  const [aWhole, aFraction = ''] = a.split('.');
  const [bWhole, bFraction = ''] = b.split('.');

  if (aWhole.length !== bWhole.length) {
    return aWhole.length > bWhole.length ? 1 : -1;
  }

  if (aWhole !== bWhole) {
    return aWhole > bWhole ? 1 : -1;
  }

  const length = Math.max(aFraction.length, bFraction.length);
  const paddedA = aFraction.padEnd(length, '0');
  const paddedB = bFraction.padEnd(length, '0');

  if (paddedA === paddedB) return 0;
  return paddedA > paddedB ? 1 : -1;
}

async function fetchWriteOffReasons(): Promise<ReasonCode[]> {
  const response = await fetch(
    `${API_BASE}/reason-codes?movement_type=WRITE_OFF`,
    {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
  );

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error('Could not load write-off reason codes.');
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('reason_codes' in payload) ||
    !Array.isArray(payload.reason_codes)
  ) {
    throw new Error('The reason codes API returned an invalid response.');
  }

  return payload.reason_codes as ReasonCode[];
}

export default function IncomingTransfers() {
  const [transfers, setTransfers] = useState<PendingTransfer[]>([]);
  const [selectedTransfer, setSelectedTransfer] =
    useState<TransferDetails | null>(null);
  const [receiptLines, setReceiptLines] = useState<
    Record<string, ReceiptLineInput>
  >({});
  const [reasonCodes, setReasonCodes] = useState<ReasonCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [pending, reasons] = await Promise.all([
        fetchPendingTransfers(),
        fetchWriteOffReasons(),
      ]);

      setTransfers(pending);
      setReasonCodes(reasons);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load incoming transfers.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransfers();
  }, [loadTransfers]);

  async function openTransfer(transferId: string) {
    setLoadingDetails(true);
    setError('');
    setSuccess('');

    try {
      const details = await fetchTransferDetails(transferId);
      setSelectedTransfer(details);

      const initialInputs: Record<string, ReceiptLineInput> = {};

      for (const line of details.lines) {
        initialInputs[line.transfer_line_id] = {
          quantity_received: String(line.quantity_sent),
          shortage_reason_code_id: '',
          shortage_note: '',
        };
      }

      setReceiptLines(initialInputs);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load transfer details.',
      );
    } finally {
      setLoadingDetails(false);
    }
  }

  function updateReceiptLine(
    lineId: string,
    field: keyof ReceiptLineInput,
    value: string,
  ) {
    setReceiptLines((current) => ({
      ...current,
      [lineId]: {
        ...current[lineId],
        [field]: value,
      },
    }));
  }

  async function submitReceipt() {
    if (!selectedTransfer || submitting) return;

    setError('');
    setSuccess('');

    for (const line of selectedTransfer.lines) {
      const input = receiptLines[line.transfer_line_id];

      if (!input || !/^\d+(?:\.\d+)?$/.test(input.quantity_received)) {
        setError(`Enter a valid received quantity for ${line.product_name}.`);
        return;
      }

      if (compareDecimal(input.quantity_received, line.quantity_sent) > 0) {
        setError(
          `Received quantity cannot exceed the sent quantity for ${line.product_name}.`,
        );
        return;
      }

      const hasShortage =
        compareDecimal(input.quantity_received, line.quantity_sent) < 0;

      if (hasShortage && !input.shortage_reason_code_id) {
        setError(`Select a write-off reason for ${line.product_name}.`);
        return;
      }

      if (hasShortage && !input.shortage_note.trim()) {
        setError(
          `Enter a note explaining the shortage for ${line.product_name}.`,
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      await receiveStockTransfer(selectedTransfer.transfer_id, {
        lines: selectedTransfer.lines.map((line) => {
          const input = receiptLines[line.transfer_line_id];
          const hasShortage =
            compareDecimal(input.quantity_received, line.quantity_sent) < 0;

          return {
            product_id: line.product_id,
            quantity_received: normalizeDecimal(input.quantity_received),
            shortage_reason_code_id: hasShortage
              ? input.shortage_reason_code_id
              : null,
            shortage_note: hasShortage ? input.shortage_note.trim() : null,
          };
        }),
      });

      setSuccess(
        `Transfer ${selectedTransfer.transfer_no} has been received successfully.`,
      );
      setSelectedTransfer(null);
      setReceiptLines({});
      await loadTransfers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not complete the receipt.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <div className="incoming-transfers-page">
        <div className="incoming-page-header">
          <div>
            <h1>Incoming Transfers</h1>
            <p>
              Review stock sent to your location and record the quantities
              received.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadTransfers()}
            disabled={loading}
            className="incoming-refresh-button"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="incoming-alert incoming-alert-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="incoming-alert incoming-alert-success" role="status">
            {success}
          </div>
        )}

        <section className="incoming-panel">
          <div className="incoming-panel-header">
            <h2>Transfers awaiting receipt</h2>
            <span className="incoming-pending-count">
              {transfers.length} pending
            </span>
          </div>

          {loading ? (
            <p className="incoming-empty-state">
              Loading incoming transfers...
            </p>
          ) : transfers.length === 0 ? (
            <p className="incoming-empty-state">
              There are no transfers waiting to be received.
            </p>
          ) : (
            <div className="incoming-table-wrapper">
              <table className="incoming-table">
                <thead>
                  <tr>
                    <th>Transfer</th>
                    <th>From</th>
                    <th>Destination</th>
                    <th>Items</th>
                    <th>Dispatched</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((transfer) => (
                    <tr key={transfer.transfer_id}>
                      <td className="incoming-transfer-number">
                        {transfer.transfer_no}
                      </td>
                      <td>{transfer.from_location_name}</td>
                      <td>{transfer.to_location_name}</td>
                      <td>{transfer.line_count}</td>
                      <td>
                        {transfer.dispatched_at
                          ? new Date(transfer.dispatched_at).toLocaleString()
                          : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => void openTransfer(transfer.transfer_id)}
                          disabled={loadingDetails}
                          className="incoming-view-button"
                        >
                          {loadingDetails ? 'Loading...' : 'View / Receive'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedTransfer && (
          <section className="incoming-panel incoming-receipt-panel">
            <div className="incoming-receipt-header">
              <div>
                <h2>Receive {selectedTransfer.transfer_no}</h2>
                <p className="incoming-route">
                  {selectedTransfer.from_location_name} →{' '}
                  {selectedTransfer.to_location_name}
                </p>

                {selectedTransfer.note && (
                  <p className="incoming-transfer-note">
                    Note: {selectedTransfer.note}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedTransfer(null)}
                className="incoming-close-button"
              >
                Close
              </button>
            </div>

            <div className="incoming-product-list">
              {selectedTransfer.lines.map((line) => {
                const input = receiptLines[line.transfer_line_id];

                const hasShortage =
                  input &&
                  /^\d+(?:\.\d+)?$/.test(input.quantity_received) &&
                  compareDecimal(
                    input.quantity_received,
                    line.quantity_sent,
                  ) < 0;

                return (
                  <div
                    key={line.transfer_line_id}
                    className="incoming-product-card"
                  >
                    <div className="incoming-product-heading">
                      <div>
                        <h3>{line.product_name}</h3>
                        <p>
                          SKU: {line.product_sku} · Unit:{' '}
                          {line.unit_of_measure}
                        </p>
                      </div>

                      <p className="incoming-sent-quantity">
                        Sent: <strong>{line.quantity_sent}</strong>
                      </p>
                    </div>

                    <label
                      className="incoming-field-label"
                      htmlFor={`received-${line.transfer_line_id}`}
                    >
                      Actual quantity received
                    </label>

                    <input
                      id={`received-${line.transfer_line_id}`}
                      type="number"
                      min="0"
                      step="any"
                      value={input?.quantity_received ?? ''}
                      onChange={(event) =>
                        updateReceiptLine(
                          line.transfer_line_id,
                          'quantity_received',
                          event.target.value,
                        )
                      }
                      className="incoming-field"
                    />

                    {hasShortage && (
                      <div className="incoming-shortage">
                        <p className="incoming-shortage-message">
                          Shortage: the missing quantity will be recorded as a
                          write-off.
                        </p>

                        <div>
                          <label
                            className="incoming-field-label"
                            htmlFor={`reason-${line.transfer_line_id}`}
                          >
                            Write-off reason
                          </label>

                          <select
                            id={`reason-${line.transfer_line_id}`}
                            value={input.shortage_reason_code_id}
                            onChange={(event) =>
                              updateReceiptLine(
                                line.transfer_line_id,
                                'shortage_reason_code_id',
                                event.target.value,
                              )
                            }
                            className="incoming-field"
                          >
                            <option value="">Select a reason</option>
                            {reasonCodes.map((reason) => (
                              <option
                                key={reason.reason_code_id}
                                value={reason.reason_code_id}
                              >
                                {reason.code} — {reason.description}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            className="incoming-field-label"
                            htmlFor={`shortage-note-${line.transfer_line_id}`}
                          >
                            Shortage explanation
                          </label>

                          <textarea
                            id={`shortage-note-${line.transfer_line_id}`}
                            rows={2}
                            value={input.shortage_note}
                            onChange={(event) =>
                              updateReceiptLine(
                                line.transfer_line_id,
                                'shortage_note',
                                event.target.value,
                              )
                            }
                            className="incoming-field incoming-textarea"
                            placeholder="Explain the missing stock..."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="incoming-receipt-actions">
              <button
                type="button"
                onClick={() => setSelectedTransfer(null)}
                disabled={submitting}
                className="incoming-cancel-button"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void submitReceipt()}
                disabled={submitting}
                className="incoming-confirm-button"
              >
                {submitting ? 'Processing...' : 'Confirm Receipt'}
              </button>
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
