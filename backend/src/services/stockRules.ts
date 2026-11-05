import type { PoolClient } from 'pg';

/** Stable error type for HTTP mapping by stock-changing controllers. */
export class StockRuleError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'StockRuleError';
  }
}

/** Validate positive, finite, exact-decimal input. Returns a decimal string for PostgreSQL NUMERIC. */
export function parsePositiveStockQuantity(raw: unknown): string {
  const quantity = typeof raw === 'number' ? String(raw) : raw;
  if (
    typeof quantity !== 'string' ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(quantity) ||
    !/[1-9]/.test(quantity) ||
    quantity.length > 100 ||
    (typeof raw === 'number' && !Number.isFinite(raw))
  ) {
    throw new StockRuleError(400, 'quantity must be a positive finite decimal.');
  }
  return quantity;
}

/** Prevent stock operations on non-active products; row lock prevents concurrent archival. */
export async function assertActiveStockProduct(
  client: PoolClient,
  productId: string,
): Promise<void> {
  const result = await client.query<{ status: string }>(
    'SELECT status FROM public.products WHERE product_id = $1 FOR SHARE',
    [productId],
  );
  if (!result.rows[0]) {
    throw new StockRuleError(404, 'Product not found.');
  }
  if (result.rows[0].status !== 'active') {
    throw new StockRuleError(400, 'Archived products cannot be adjusted.');
  }
}

export type StockChangeRow = {
  inventory_id: string;
  quantity_before: string;
  quantity_after: string;
};

/**
 * Decrease stock safely inside the CALLER'S transaction.
 * Lock the product-location record, report its current quantity on conflict,
 * and keep an atomic quantity >= removal condition on the UPDATE itself.
 * Transfer Stock can reuse this for the source location.
 * Caller must wrap this and the stock movement INSERT in withTransaction().
 */
export async function removeStockAtLocation(
  client: PoolClient,
  productId: string,
  locationId: string,
  quantity: string,
): Promise<StockChangeRow> {
  const locked = await client.query<{
    inventory_id: string;
    available: string;
    sufficient: boolean;
  }>(
    `SELECT inventory_id,
            quantity::text AS available,
            (quantity >= $3::numeric) AS sufficient
     FROM public.inventory
     WHERE product_id = $1 AND location_id = $2
     FOR UPDATE`,
    [productId, locationId, quantity],
  );

  const current = locked.rows[0];
  if (!current || !current.sufficient) {
    const available = current?.available ?? '0';
    throw new StockRuleError(
      409,
      `Cannot remove ${quantity}; only ${available} in stock at this location.`,
    );
  }

  // Defensive check in the UPDATE itself; PostgreSQL performs exact decimal arithmetic.
  const updated = await client.query<StockChangeRow>(
    `UPDATE public.inventory
     SET quantity = quantity - $3::numeric
     WHERE product_id = $1
       AND location_id = $2
       AND quantity >= $3::numeric
     RETURNING inventory_id,
               (quantity + $3::numeric)::text AS quantity_before,
               quantity::text AS quantity_after`,
    [productId, locationId, quantity],
  );

  const row = updated.rows[0];
  if (!row) {
    // Should not occur while this transaction holds the row lock.
    throw new Error('Locked inventory row could not be updated.');
  }
  return row;
}
