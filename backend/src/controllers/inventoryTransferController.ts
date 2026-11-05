
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

type TransferInput = {
  product_id: string;
  from_location_id: string;
  to_location_id: string;
  quantity: string;
  note: string | null;
};

type InventoryQuantityRow = {
  inventory_id: string;
  quantity_before: string;
  quantity_after: string;
};

type MovementRow = {
  movement_id: string;
  movement_type: string;
  location_id: string;
  quantity_change: string;
  quantity_before: string;
  quantity_after: string;
  reference_id: string;
};

type PgError = Error & { code?: string; constraint?: string };

class RequestError extends Error {
  constructor(
    public readonly statusCode: 400 | 404,
    message: string,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELDS = new Set([
  'product_id',
  'from_location_id',
  'to_location_id',
  'quantity',
  'note',
]);

function parseTransfer(body: unknown): TransferInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'Body must be a JSON object.');
  }

  const data = body as Record<string, unknown>;
  const unknown = Object.keys(data).filter((field) => !FIELDS.has(field));

  if (unknown.length) {
    throw new RequestError(400, `Unknown field(s): ${unknown.join(', ')}.`);
  }

  if (typeof data.product_id !== 'string' || !UUID_REGEX.test(data.product_id)) {
    throw new RequestError(400, 'product_id must be a valid UUID.');
  }

  if (
    typeof data.from_location_id !== 'string' ||
    !UUID_REGEX.test(data.from_location_id)
  ) {
    throw new RequestError(400, 'from_location_id must be a valid UUID.');
  }

  if (
    typeof data.to_location_id !== 'string' ||
    !UUID_REGEX.test(data.to_location_id)
  ) {
    throw new RequestError(400, 'to_location_id must be a valid UUID.');
  }

  if (data.from_location_id === data.to_location_id) {
    throw new RequestError(
      400,
      'Source and destination locations must be different.',
    );
  }

  const quantity = parsePositiveStockQuantity(data.quantity);

  if (
    data.note !== undefined &&
    data.note !== null &&
    (typeof data.note !== 'string' || data.note.trim().length > 2000)
  ) {
    throw new RequestError(400, 'note must be a string or null (maximum 2000 characters).');
  }

  return {
    product_id: data.product_id,
    from_location_id: data.from_location_id,
    to_location_id: data.to_location_id,
    quantity,
    note: typeof data.note === 'string' ? data.note.trim() || null : null,
  };
}

// POST /api/inventory/transfers
export async function createInventoryTransfer(
  req: SessionAuthenticatedRequest,
  res: Response,
): Promise<void> {
  let input: TransferInput;

  try {
    input = parseTransfer(req.body);
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
      await assertActiveStockProduct(client, input.product_id);

      const locations = await client.query<{ location_id: string }>(
        `SELECT location_id
         FROM public.locations
         WHERE location_id = ANY($1::uuid[])`,
        [[input.from_location_id, input.to_location_id]],
      );

      if (locations.rows.length !== 2) {
        throw new RequestError(404, 'Source or destination location not found.');
      }

      // Always prepare inventory rows in the same location_id order.
      // Missing rows are created with zero stock inside this transaction.
      const orderedLocationIds = [
        input.from_location_id,
        input.to_location_id,
      ].sort();

      for (const locationId of orderedLocationIds) {
        await client.query(
          `INSERT INTO public.inventory (
             product_id, location_id, quantity
           )
           VALUES ($1, $2, 0)
           ON CONFLICT (product_id, location_id) DO NOTHING`,
          [input.product_id, locationId],
        );
      }

      // Lock both inventory rows in a consistent order.
      // Opposite transfers therefore acquire the same locks in the same order.
      const lockedInventory = await client.query<{
        inventory_id: string;
        location_id: string;
        quantity: string;
      }>(
        `SELECT inventory_id,
                location_id,
                quantity::text AS quantity
         FROM public.inventory
         WHERE product_id = $1
           AND location_id = ANY($2::uuid[])
         ORDER BY location_id
         FOR UPDATE`,
        [
          input.product_id,
          orderedLocationIds,
        ],
      );

      if (lockedInventory.rows.length !== 2) {
        throw new Error('Could not lock both inventory locations.');
      }

      // Remove stock from the source.
      // The shared helper checks available stock and performs a guarded update.
      const source = await removeStockAtLocation(
        client,
        input.product_id,
        input.from_location_id,
        input.quantity,
      );

      // Add the same quantity to the already-locked destination row.
      const destinationResult = await client.query<InventoryQuantityRow>(
        `WITH changed AS (
           INSERT INTO public.inventory AS inv (
             product_id, location_id, quantity
           )
           VALUES ($1, $2, $3::numeric)
           ON CONFLICT (product_id, location_id)
           DO UPDATE SET quantity = inv.quantity + EXCLUDED.quantity
           RETURNING inventory_id, quantity
         )
         SELECT inventory_id,
                (quantity - $3::numeric)::text AS quantity_before,
                quantity::text AS quantity_after
         FROM changed`,
        [input.product_id, input.to_location_id, input.quantity],
      );

      const destination = destinationResult.rows[0];

      if (!destination) {
        throw new Error('Destination inventory update returned no row.');
      }

      // Both movement records share one reference_id to identify this transfer.
      const referenceResult = await client.query<{ reference_id: string }>(
        'SELECT gen_random_uuid()::text AS reference_id',
      );

      const referenceId = referenceResult.rows[0]?.reference_id;

      if (!referenceId) {
        throw new Error('Could not generate transfer reference.');
      }

      const movements = await client.query<MovementRow>(
        `INSERT INTO public.stock_movements (
           product_id, location_id, user_id, movement_type,
           quantity_change, quantity_before, quantity_after,
           reference_id, reason, notes
         )
         VALUES
           ($1, $2, $3, 'TRANSFER_OUT',
            -$4::numeric, $5::numeric, $6::numeric,
            $7::uuid, 'Stock transfer', $8),
           ($1, $9, $3, 'TRANSFER_IN',
            $4::numeric, $10::numeric, $11::numeric,
            $7::uuid, 'Stock transfer', $8)
         RETURNING movement_id, movement_type, location_id,
                   quantity_change::text AS quantity_change,
                   quantity_before::text AS quantity_before,
                   quantity_after::text AS quantity_after,
                   reference_id::text AS reference_id`,
        [
          input.product_id,
          input.from_location_id,
          userId,
          input.quantity,
          source.quantity_before,
          source.quantity_after,
          referenceId,
          input.note,
          input.to_location_id,
          destination.quantity_before,
          destination.quantity_after,
        ],
      );

      if (movements.rows.length !== 2) {
        throw new Error('Transfer movement records were not created correctly.');
      }

      return {
        reference_id: referenceId,
        product_id: input.product_id,
        quantity_transferred: input.quantity,
        source: {
          location_id: input.from_location_id,
          inventory_id: source.inventory_id,
          quantity_before: source.quantity_before,
          quantity_after: source.quantity_after,
        },
        destination: {
          location_id: input.to_location_id,
          inventory_id: destination.inventory_id,
          quantity_before: destination.quantity_before,
          quantity_after: destination.quantity_after,
        },
        movements: movements.rows,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    // The transaction helper retries concurrency failures once.
    // If retries are exhausted, return HTTP 503.
    if (error instanceof TransactionConcurrencyError) {
      res.status(503).json({ error: error.message });
      return;
    }

    if (error instanceof RequestError || error instanceof StockRuleError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    const pgError = error as PgError;

    if (
      pgError.code === '23514' &&
      (pgError.constraint === 'inventory_quantity_nonnegative' ||
        pgError.constraint === 'stock_movements_after_nonnegative')
    ) {
      res.status(409).json({ error: 'Insufficient stock at this location.' });
      return;
    }

    console.error('Inventory transfer failed:', error);
    res.status(500).json({ error: 'Unable to transfer inventory.' });
  }
}
