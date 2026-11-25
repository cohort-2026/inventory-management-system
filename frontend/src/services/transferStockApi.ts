
import { getLocations, getProducts } from './api';
import type { LocationOption, ProductOption } from './api';

const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000'}/api`;

type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type TransferInventoryRow = {
  inventory_id: string | null;
  product_id: string;
  location_id: string;
  quantity: string;
};

export type TransferResult = {
  transfer_id: string;
  transfer_no: string;
  status: 'IN_TRANSIT';
  quantity_sent: string;
};

export type TransferLine = {
  transfer_line_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  unit_of_measure: string;
  quantity_sent: string;
  quantity_received: string | null;
  shortage_reason_code_id?: string | null;
  shortage_note?: string | null;
};

export type PendingTransfer = {
  transfer_id: string;
  transfer_no: string;
  status: string;
  note: string | null;
  created_at: string;
  dispatched_at: string | null;
  from_location_id: string;
  from_location_name: string;
  to_location_id: string;
  to_location_name: string;
  line_count: number;
};

export type TransferDetails = PendingTransfer & {
  received_at?: string | null;
  received_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  rejection_note?: string | null;
  lines: TransferLine[];
};

export type ReceiveTransferResult = {
  transfer_id: string;
  transfer_no: string;
  status: 'RECEIVED';
};

export type CancelTransferResult = {
  transfer_id: string;
  transfer_no: string;
  status: 'CANCELLED';
};

export class TransferApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'TransferApiError';
  }
}

async function fetchJson(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      object(payload) && typeof payload.error === 'string'
        ? payload.error
        : response.status === 403
          ? 'You do not have permission to perform this transfer action.'
          : response.status === 401
            ? 'Your session has expired. Please sign in again.'
            : `Request failed (HTTP ${response.status}).`;

    throw new TransferApiError(response.status, message);
  }

  return payload;
}

export async function fetchTransferOptions(): Promise<{
  products: ProductOption[];
  locations: LocationOption[];
}> {
  const [products, locations] = await Promise.all([
    getProducts(),
    getLocations(),
  ]);

  return { products, locations };
}

// GET /api/inventory is paginated. Load every page.
export async function fetchAllTransferInventory(): Promise<TransferInventoryRow[]> {
  const all: TransferInventoryRow[] = [];
  const pageSize = 100;
  let page = 1;

  while (true) {
    const payload = await fetchJson(
      `/inventory?page=${page}&pageSize=${pageSize}`,
    );

    if (
      !object(payload) ||
      !Array.isArray(payload.items) ||
      typeof payload.total !== 'number' ||
      !Number.isSafeInteger(payload.total) ||
      payload.total < 0
    ) {
      throw new Error(
        'The inventory API returned an invalid paginated response.',
      );
    }

    for (const row of payload.items as unknown[]) {
      if (
        !object(row) ||
        (row.inventory_id !== null &&
          typeof row.inventory_id !== 'string') ||
        typeof row.product_id !== 'string' ||
        typeof row.location_id !== 'string' ||
        (typeof row.quantity !== 'string' &&
          typeof row.quantity !== 'number')
      ) {
        throw new Error(
          'The inventory API returned an invalid stock record.',
        );
      }

      const quantity = String(row.quantity);

      if (!/^(?:\d+)(?:\.\d+)?$/.test(quantity)) {
        throw new Error(
          'The inventory API returned an invalid stock quantity.',
        );
      }

      all.push({
        inventory_id: row.inventory_id as string | null,
        product_id: row.product_id,
        location_id: row.location_id,
        quantity,
      });
    }

    if (all.length >= payload.total) {
      return all;
    }

    if (payload.items.length === 0) {
      throw new Error(
        'Inventory pagination ended before all records were loaded.',
      );
    }

    page += 1;

    if (page > 1000) {
      throw new Error(
        'Too many inventory pages; a filtered inventory endpoint is required.',
      );
    }
  }
}

// POST /api/inventory/transfers/dispatch
export async function submitStockTransfer(input: {
  product_id: string;
  from_location_id: string;
  to_location_id: string;
  quantity: string;
  note: string | null;
}): Promise<TransferResult> {
  const payload = await fetchJson('/inventory/transfers/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_location_id: input.from_location_id,
      to_location_id: input.to_location_id,
      note: input.note,
      lines: [
        {
          product_id: input.product_id,
          quantity: input.quantity,
        },
      ],
    }),
  });

  if (
    !object(payload) ||
    typeof payload.transfer_id !== 'string' ||
    typeof payload.transfer_no !== 'string' ||
    payload.status !== 'IN_TRANSIT'
  ) {
    throw new Error(
      'Dispatch may have completed, but the server returned an unexpected response. Refresh transfers before retrying.',
    );
  }

  return {
    transfer_id: payload.transfer_id,
    transfer_no: payload.transfer_no,
    status: 'IN_TRANSIT',
    quantity_sent: input.quantity,
  };
}

// GET /api/inventory/transfers/pending
export async function fetchPendingTransfers(): Promise<PendingTransfer[]> {
  const payload = await fetchJson('/inventory/transfers/pending');

  if (!object(payload) || !Array.isArray(payload.transfers)) {
    throw new Error('The pending transfers API returned an invalid response.');
  }

  return payload.transfers as PendingTransfer[];
}

// GET /api/inventory/transfers/:transferId
export async function fetchTransferDetails(
  transferId: string,
): Promise<TransferDetails> {
  const payload = await fetchJson(
    `/inventory/transfers/${encodeURIComponent(transferId)}`,
  );

  if (!object(payload) || !object(payload.transfer)) {
    throw new Error('The transfer details API returned an invalid response.');
  }

  return payload.transfer as unknown as TransferDetails;
}

// POST /api/inventory/transfers/:transferId/receive
export async function receiveStockTransfer(
  transferId: string,
  input: {
    lines: Array<{
      product_id: string;
      quantity_received: string;
      shortage_reason_code_id?: string | null;
      shortage_note?: string | null;
    }>;
  },
): Promise<ReceiveTransferResult> {
  const payload = await fetchJson(
    `/inventory/transfers/${encodeURIComponent(transferId)}/receive`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  if (
    !object(payload) ||
    typeof payload.transfer_id !== 'string' ||
    typeof payload.transfer_no !== 'string' ||
    payload.status !== 'RECEIVED'
  ) {
    throw new Error(
      'Receipt may have completed, but the server returned an unexpected response. Refresh the transfer before retrying.',
    );
  }

  return {
    transfer_id: payload.transfer_id,
    transfer_no: payload.transfer_no,
    status: 'RECEIVED',
  };
}

// POST /api/inventory/transfers/:transferId/cancel
export async function cancelStockTransfer(
  transferId: string,
): Promise<CancelTransferResult> {
  const payload = await fetchJson(
    `/inventory/transfers/${encodeURIComponent(transferId)}/cancel`,
    {
      method: 'POST',
    },
  );

  if (
    !object(payload) ||
    typeof payload.transfer_id !== 'string' ||
    typeof payload.transfer_no !== 'string' ||
    payload.status !== 'CANCELLED'
  ) {
    throw new Error(
      'Cancellation may have completed, but the server returned an unexpected response. Refresh the transfer before retrying.',
    );
  }

  return {
    transfer_id: payload.transfer_id,
    transfer_no: payload.transfer_no,
    status: 'CANCELLED',
  };
}
