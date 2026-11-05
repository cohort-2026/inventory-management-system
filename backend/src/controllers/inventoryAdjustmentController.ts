
import type { Response } from 'express';
import type { SessionAuthenticatedRequest } from '../middleware/requireSession';
import {
  withTransaction,
  TransactionConcurrencyError,
} from '../db/withTransaction';
import {
  StockRuleError,
  assertActiveStockProduct,
  parsePositiveStockQuantity,
  removeStockAtLocation,
} from '../services/stockRules';

type Direction = 'increase' | 'decrease';

type AdjustmentInput = {
  product_id: string;
  location_id: string;
  direction: Direction;
  quantity: string;
  reason: string;
  notes: string | null;
};

type InventoryQuantityRow = {
  inventory_id: string;
  quantity_before: string;
  quantity_after: string;
};

type MovementRow = {
  movement_id: string;
  product_id: string;
  location_id: string;
  user_id: string;
  movement_type: string;
  quantity_change: string;
  quantity_before: string;
  quantity_after: string;
  reason: string | null;
  notes: string | null;
  created_at: Date;
};

type PgError = Error & {
  code?: string;
  constraint?: string;
};

class RequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELDS = new Set([
  'product_id',
  'location_id',
  'direction',
  'quantity',
  'reason',
  'notes',
]);

function parseAdjustment(body: unknown): AdjustmentInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'Body must be a JSON object.');
  }

  const data = body as Record<string, unknown>;
  const unknown = Object.keys(data).filter((field) => !FIELDS.has(field));

  if (unknown.length) {
    throw new RequestError(
      400,
      `Unknown field(s): ${unknown.join(', ')}.`,
    );
  }

  if (
    typeof data.product_id !== 'string' ||
    !UUID_REGEX.test(data.product_id)
  ) {
    throw new RequestError(400, 'product_id must be a valid UUID.');
  }

  if (
    typeof data.location_id !== 'string' ||
    !UUID_REGEX.test(data.location_id)
  ) {
    throw new RequestError(400, 'location_id must be a valid UUID.');
  }

  if (data.direction !== 'increase' && data.direction !== 'decrease') {
    throw new RequestError(400, 'direction must be increase or decrease.');
  }

  const quantity = parsePositiveStockQuantity(data.quantity);

  if (
    typeof data.reason !== 'string' ||
    !data.reason.trim() ||
    data.reason.trim().length > 500
  ) {
    throw new RequestError(
      400,
      'reason is required (maximum 500 characters).',
    );
  }

  if (
    data.notes !== undefined &&
    data.notes !== null &&
    (typeof data.notes !== 'string' || data.notes.trim().length > 2000)
  ) {
    throw new RequestError(
      400,
      'notes must be a string or null (maximum 2000 characters).',
    );
  }

  return {
    product_id: data.product_id,
    location_id: data.location_id,
    direction: data.direction,
    quantity,
    reason: data.reason.trim(),
    notes:
      typeof data.notes === 'string'
        ? data.notes.trim() || null
        : null,
  };
}

// POST /api/inventory/adjustments
export async function createInventoryAdjustment(
  req: SessionAuthenticatedRequest,
  res: Response,
): Promise<void> {
  let input: AdjustmentInput;

  try {
    input = parseAdjustment(req.body);
  } catch (error) {
    if (error instanceof RequestError || error instanceof StockRuleError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    throw error;
  }

  const userId = req.authenticatedUser?.id;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      // Enforce the shared active-product rule within this transaction.
      await assertActiveStockProduct(client, input.product_id);

      const location = await client.query(
        'SELECT location_id FROM public.locations WHERE location_id = $1',
        [input.location_id],
      );

      if (location.rowCount === 0) {
        throw new RequestError(404, 'Location not found.');
      }

      let quantityRow: InventoryQuantityRow | undefined;

      if (input.direction === 'increase') {
        // Atomic upsert: parallel increases accumulate instead of overwriting.
        // RETURNING reads the new value; subtracting the delta recovers the old one.
        const upsert = await client.query<InventoryQuantityRow>(
          `WITH changed AS (
             INSERT INTO public.inventory AS inv (product_id, location_id, quantity)
             VALUES ($1, $2, $3::numeric)
             ON CONFLICT (product_id, location_id)
             DO UPDATE SET quantity = inv.quantity + EXCLUDED.quantity
             RETURNING inventory_id, quantity
           )
           SELECT inventory_id,
                  (quantity - $3::numeric)::text AS quantity_before,
                  quantity::text AS quantity_after
           FROM changed`,
          [input.product_id, input.location_id, input.quantity],
        );

        quantityRow = upsert.rows[0];
      } else {
        // Shared concurrency-safe removal rule, also reusable by stock transfers.
        quantityRow = await removeStockAtLocation(
          client,
          input.product_id,
          input.location_id,
          input.quantity,
        );
      }

      if (!quantityRow) {
        throw new Error('Inventory update returned no row.');
      }

      const signedChange =
        input.direction === 'increase'
          ? input.quantity
          : `-${input.quantity}`;

      const movement = await client.query<MovementRow>(
        `INSERT INTO public.stock_movements (
           product_id, location_id, user_id, movement_type,
           quantity_change, quantity_before, quantity_after,
           reason, notes
         ) VALUES ($1, $2, $3, 'ADJUSTMENT', $4::numeric,
                   $5::numeric, $6::numeric, $7, $8)
         RETURNING movement_id, product_id, location_id, user_id,
                   movement_type, quantity_change::text AS quantity_change,
                   quantity_before::text AS quantity_before,
                   quantity_after::text AS quantity_after,
                   reason, notes, created_at`,
        [
          input.product_id,
          input.location_id,
          userId,
          signedChange,
          quantityRow.quantity_before,
          quantityRow.quantity_after,
          input.reason,
          input.notes,
        ],
      );

      if (!movement.rows[0]) {
        throw new Error('Movement insert returned no row.');
      }

      return {
        inventory_id: quantityRow.inventory_id,
        quantity: quantityRow.quantity_after,
        movement: movement.rows[0],
      };
    });

    res.status(200).json(result);
  } catch (error) {
    // Return a clear response when the transaction retry limit is reached.
    if (error instanceof TransactionConcurrencyError) {
      res.status(503).json({ error: error.message });
      return;
    }

    // Preserve the status code from shared stock validation rules.
    if (error instanceof StockRuleError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    // Preserve the status code from request validation.
    if (error instanceof RequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    const pgError = error as PgError;

    if (
      pgError.code === '23514' &&
      (
        pgError.constraint === 'inventory_quantity_nonnegative' ||
        pgError.constraint === 'stock_movements_after_nonnegative'
      )
    ) {
      res.status(409).json({
        error: 'Insufficient stock at this location.',
      });
      return;
    }

    console.error('Inventory adjustment failed:', error);

    res.status(500).json({
      error: 'Unable to adjust inventory.',
    });
  }
}
