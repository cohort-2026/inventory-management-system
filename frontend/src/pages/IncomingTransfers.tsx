
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

function normalizeDecimal(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction.replace(/0+$/, '');

  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
}

function compareDecimal(first: string, second: string): number {
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
          quantity_received: line.quantity_sent,
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
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Incoming Transfers
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Review stock sent to your location and record the quantities received.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadTransfers()}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Transfers awaiting receipt
            </h2>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              {transfers.length} pending
            </span>
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Loading incoming transfers...
            </p>
          ) : transfers.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              There are no transfers waiting to be received.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="border-b bg-gray-50 text-gray-600">
                  <tr>
                    <th className="p-3">Transfer</th>
                    <th className="p-3">From</th>
                    <th className="p-3">Destination</th>
                    <th className="p-3">Items</th>
                    <th className="p-3">Dispatched</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transfers.map((transfer) => (
                    <tr key={transfer.transfer_id}>
                      <td className="p-3 font-semibold text-gray-900">
                        {transfer.transfer_no}
                      </td>
                      <td className="p-3">{transfer.from_location_name}</td>
                      <td className="p-3">{transfer.to_location_name}</td>
                      <td className="p-3">{transfer.line_count}</td>
                      <td className="p-3">
                        {transfer.dispatched_at
                          ? new Date(transfer.dispatched_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => void openTransfer(transfer.transfer_id)}
                          disabled={loadingDetails}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          View / Receive
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
          <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Receive {selectedTransfer.transfer_no}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {selectedTransfer.from_location_name} →{' '}
                  {selectedTransfer.to_location_name}
                </p>
                {selectedTransfer.note && (
                  <p className="mt-2 text-sm text-gray-600">
                    Note: {selectedTransfer.note}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedTransfer(null)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              {selectedTransfer.lines.map((line) => {
                const input = receiptLines[line.transfer_line_id];
                const hasShortage =
                  input &&
                  /^\d+(?:\.\d+)?$/.test(input.quantity_received) &&
                  compareDecimal(input.quantity_received, line.quantity_sent) < 0;

                return (
                  <div
                    key={line.transfer_line_id}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <div className="mb-3 flex flex-wrap justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {line.product_name}
                        </h3>
                        <p className="text-xs text-gray-500">
                          SKU: {line.product_sku} · Unit: {line.unit_of_measure}
                        </p>
                      </div>
                      <p className="text-sm text-gray-600">
                        Sent: <strong>{line.quantity_sent}</strong>
                      </p>
                    </div>

                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Actual quantity received
                    </label>
                    <input
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
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />

                    {hasShortage && (
                      <div className="mt-3 space-y-3 rounded-lg bg-amber-50 p-3">
                        <p className="text-sm font-medium text-amber-800">
                          Shortage: the missing quantity will be recorded as a write-off.
                        </p>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Write-off reason
                          </label>
                          <select
                            value={input.shortage_reason_code_id}
                            onChange={(event) =>
                              updateReceiptLine(
                                line.transfer_line_id,
                                'shortage_reason_code_id',
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
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
                          <label className="mb-1 block text-sm font-medium text-gray-700">
                            Shortage explanation
                          </label>
                          <textarea
                            rows={2}
                            value={input.shortage_note}
                            onChange={(event) =>
                              updateReceiptLine(
                                line.transfer_line_id,
                                'shortage_note',
                                event.target.value,
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                            placeholder="Explain the missing stock..."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
              <button
                type="button"
                onClick={() => setSelectedTransfer(null)}
                disabled={submitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitReceipt()}
                disabled={submitting}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
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
