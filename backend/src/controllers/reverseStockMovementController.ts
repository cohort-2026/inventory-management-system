
import type { Response } from 'express';
import type { SessionAuthenticatedRequest } from '../middleware/requireSession';
import {
  withTransaction,
  TransactionConcurrencyError,
} from '../db/withTransaction';
import {
  StockRuleError,
  assertActiveStockProduct,
  removeStockAtLocation,
} from '../services/stockRules';

type OriginalMovement = {
  movement_id: string;
  movement_no: string;
  product_id: string;
  location_id: string;
  movement_type: string;
  quantity_change: string;
  reference_id: string | null;
  reference_no: string | null;
  reverses_movement_id: string | null;
};

type InventoryChange = {
  inventory_id: string;
  quantity_before: string;
  quantity_after: string;
};

type ReversalMovement = {
  movement_id: string;
  movement_no: string;
  movement_type: string;
  location_id: string;
  quantity_change: string;
  quantity_before: string;
  quantity_after: string;
  reverses_movement_id: string;
  reference_id: string | null;
};

type PgError = Error & {
  code?: string;
  constraint?: string;
};

class RequestError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseReversalNote(body: unknown): string {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw new RequestError(400, 'Body must be a JSON object.');
  }

  const data = body as Record<string, unknown>;
  const unknownFields = Object.keys(data).filter(
    (field) => field !== 'notes',
  );

  if (unknownFields.length > 0) {
    throw new RequestError(
      400,
      `Unknown field(s): ${unknownFields.join(', ')}.`,
    );
  }

  if (
    typeof data.notes !== 'string' ||
    !data.notes.trim() ||
    data.notes.trim().length > 2000
  ) {
    throw new RequestError(
      400,
      'A reversal note is required (maximum 2000 characters).',
    );
  }

  return data.notes.trim();
}

async function assertActiveLocation(
  client: Parameters<typeof assertActiveStockProduct>[0],
  locationId: string,
): Promise<void> {
  const result = await client.query<{ status: string }>(
    `SELECT status
     FROM public.locations
     WHERE location_id = $1
     FOR SHARE`,
    [locationId],
  );

  const location = result.rows[0];

  if (!location) {
    throw new RequestError(404, 'Location not found.');
  }

  if (location.status !== 'active') {
    throw new StockRuleError(
      400,
      'Inactive locations cannot receive stock movements.',
    );
  }
}

async function addStockAtLocation(
  client: Parameters<typeof assertActiveStockProduct>[0],
  productId: string,
  locationId: string,
  quantity: string,
): Promise<InventoryChange> {
  const result = await client.query<InventoryChange>(
    `WITH changed AS (
       INSERT INTO public.inventory AS inv (
         product_id,
         location_id,
         quantity
       )
       VALUES ($1, $2, $3::numeric)
       ON CONFLICT (product_id, location_id)
       DO UPDATE
         SET quantity = inv.quantity + EXCLUDED.quantity
       RETURNING inventory_id, quantity
     )
     SELECT inventory_id,
            (quantity - $3::numeric)::text AS quantity_before,
            quantity::text AS quantity_after
     FROM changed`,
    [productId, locationId, quantity],
  );

  const inventory = result.rows[0];

  if (!inventory) {
    throw new Error('Inventory update returned no row.');
  }

  return inventory;
}

async function assertNotAlreadyReversed(
  client: Parameters<typeof assertActiveStockProduct>[0],
  movementIds: string[],
): Promise<void> {
  const result = await client.query(
    `SELECT reverses_movement_id
     FROM public.stock_movements
     WHERE reverses_movement_id = ANY($1::uuid[])
     LIMIT 1`,
    [movementIds],
  );

  if (result.rows.length > 0) {
    throw new RequestError(
      409,
      'This movement has already been reversed.',
    );
  }
}

async function reverseOrdinaryMovement(
  client: Parameters<typeof assertActiveStockProduct>[0],
  original: OriginalMovement,
  userId: string,
  notes: string,
): Promise<{
  reversed_movement: ReversalMovement;
}> {
  if (original.reverses_movement_id) {
    throw new RequestError(
      400,
      'A reversal movement cannot itself be reversed.',
    );
  }

  await assertNotAlreadyReversed(
    client,
    [original.movement_id],
  );

  await assertActiveStockProduct(
    client,
    original.product_id,
  );

  await assertActiveLocation(
    client,
    original.location_id,
  );

  const reasonResult = await client.query<{
    reason_code_id: string;
    label: string;
  }>(
    `SELECT reason_code_id, label
     FROM public.reason_codes
     WHERE movement_type = 'ADJUSTMENT'
       AND code = 'DATA_ENTRY_CORRECTION'
       AND active = true
     LIMIT 1`,
  );

  const reasonCode = reasonResult.rows[0];

  if (!reasonCode) {
    throw new Error(
      'The active ADJUSTMENT / DATA_ENTRY_CORRECTION reason code was not found.',
    );
  }

  const quantity = original.quantity_change.startsWith('-')
    ? original.quantity_change.slice(1)
    : original.quantity_change;

  const reversalIsIncrease =
    original.quantity_change.startsWith('-');

  let inventory: InventoryChange;

  if (reversalIsIncrease) {
    inventory = await addStockAtLocation(
      client,
      original.product_id,
      original.location_id,
      quantity,
    );
  } else {
    inventory = await removeStockAtLocation(
      client,
      original.product_id,
      original.location_id,
      quantity,
    );
  }

  const signedQuantity = reversalIsIncrease
    ? quantity
    : `-${quantity}`;

  const result = await client.query<ReversalMovement>(
    `INSERT INTO public.stock_movements (
       product_id,
       location_id,
       user_id,
       movement_type,
       quantity_change,
       quantity_before,
       quantity_after,
       reason_code_id,
       reference_no,
       reason,
       notes,
       reverses_movement_id
     )
     VALUES (
       $1, $2, $3, 'ADJUSTMENT',
       $4::numeric, $5::numeric, $6::numeric,
       $7, $8, $9, $10, $11
     )
     RETURNING
       movement_id,
       movement_no,
       movement_type,
       location_id,
       quantity_change::text AS quantity_change,
       quantity_before::text AS quantity_before,
       quantity_after::text AS quantity_after,
       reverses_movement_id,
       reference_id::text AS reference_id`,
    [
      original.product_id,
      original.location_id,
      userId,
      signedQuantity,
      inventory.quantity_before,
      inventory.quantity_after,
      reasonCode.reason_code_id,
      original.reference_no,
      reasonCode.label,
      notes,
      original.movement_id,
    ],
  );

  const reversedMovement = result.rows[0];

  if (!reversedMovement) {
    throw new Error('Reversal movement was not created.');
  }

  return {
    reversed_movement: reversedMovement,
  };
}

async function reverseTransfer(
  client: Parameters<typeof assertActiveStockProduct>[0],
  originalMovementId: string,
  referenceId: string,
  userId: string,
  notes: string,
): Promise<{
  reference_id: string;
  movements: ReversalMovement[];
}> {
  // Lock both original transfer records in a consistent order.
  const pairResult = await client.query<OriginalMovement>(
    `SELECT
       movement_id,
       movement_no,
       product_id,
       location_id,
       movement_type,
       quantity_change::text AS quantity_change,
       reference_id::text AS reference_id,
       reference_no,
       reverses_movement_id
     FROM public.stock_movements
     WHERE reference_id = $1
     ORDER BY movement_id
     FOR UPDATE`,
    [referenceId],
  );

  const pair = pairResult.rows;

  if (
    pair.length !== 2 ||
    !pair.some(
      (movement) => movement.movement_id === originalMovementId,
    )
  ) {
    throw new RequestError(
      409,
      'The original transfer does not have a valid pair of movement records.',
    );
  }

  const transferOut = pair.find(
    (movement) => movement.movement_type === 'TRANSFER_OUT',
  );

  const transferIn = pair.find(
    (movement) => movement.movement_type === 'TRANSFER_IN',
  );

  if (
    !transferOut ||
    !transferIn ||
    transferOut.product_id !== transferIn.product_id
  ) {
    throw new RequestError(
      409,
      'The original transfer records are inconsistent.',
    );
  }

  if (
    transferOut.reverses_movement_id ||
    transferIn.reverses_movement_id
  ) {
    throw new RequestError(
      400,
      'A reversal transfer cannot itself be reversed.',
    );
  }

  const outQuantity = transferOut.quantity_change.startsWith('-')
    ? transferOut.quantity_change.slice(1)
    : transferOut.quantity_change;

  const inQuantity = transferIn.quantity_change.startsWith('-')
    ? transferIn.quantity_change.slice(1)
    : transferIn.quantity_change;

  if (
    !transferOut.quantity_change.startsWith('-') ||
    transferIn.quantity_change.startsWith('-') ||
    outQuantity !== inQuantity
  ) {
    throw new RequestError(
      409,
      'The original transfer quantities are inconsistent.',
    );
  }

  await assertNotAlreadyReversed(
    client,
    [transferOut.movement_id, transferIn.movement_id],
  );

  await assertActiveStockProduct(
    client,
    transferOut.product_id,
  );

  await assertActiveLocation(client, transferOut.location_id);
  await assertActiveLocation(client, transferIn.location_id);

  // Prepare both inventory rows in a consistent order.
  const orderedLocationIds = [
    transferOut.location_id,
    transferIn.location_id,
  ].sort();

  for (const locationId of orderedLocationIds) {
    await client.query(
      `INSERT INTO public.inventory (
         product_id,
         location_id,
         quantity
       )
       VALUES ($1, $2, 0)
       ON CONFLICT (product_id, location_id) DO NOTHING`,
      [transferOut.product_id, locationId],
    );
  }

  // Lock both inventory rows in the same order.
  const lockedInventory = await client.query(
    `SELECT inventory_id, location_id
     FROM public.inventory
     WHERE product_id = $1
       AND location_id = ANY($2::uuid[])
     ORDER BY location_id
     FOR UPDATE`,
    [transferOut.product_id, orderedLocationIds],
  );

  if (lockedInventory.rows.length !== 2) {
    throw new Error('Could not lock both transfer inventory rows.');
  }

  // Reverse the original destination first: remove the transferred stock.
  const source = await removeStockAtLocation(
    client,
    transferOut.product_id,
    transferIn.location_id,
    outQuantity,
  );

  // Return the stock to the original source.
  const destination = await addStockAtLocation(
    client,
    transferOut.product_id,
    transferOut.location_id,
    outQuantity,
  );

  const newReferenceResult = await client.query<{
    reference_id: string;
  }>(
    'SELECT gen_random_uuid()::text AS reference_id',
  );

  const newReferenceId = newReferenceResult.rows[0]?.reference_id;

  if (!newReferenceId) {
    throw new Error('Could not generate reversal transfer reference.');
  }

  const movementResult = await client.query<ReversalMovement>(
    `INSERT INTO public.stock_movements (
       product_id,
       location_id,
       user_id,
       movement_type,
       quantity_change,
       quantity_before,
       quantity_after,
       reference_id,
       reason,
       notes,
       reverses_movement_id
     )
     VALUES
       (
         $1, $2, $3, 'TRANSFER_OUT',
         -$4::numeric, $5::numeric, $6::numeric,
         $7::uuid, 'Transfer reversal', $8, $9
       ),
       (
         $1, $10, $3, 'TRANSFER_IN',
         $4::numeric, $11::numeric, $12::numeric,
         $7::uuid, 'Transfer reversal', $8, $13
       )
     RETURNING
       movement_id,
       movement_no,
       movement_type,
       location_id,
       quantity_change::text AS quantity_change,
       quantity_before::text AS quantity_before,
       quantity_after::text AS quantity_after,
       reverses_movement_id,
       reference_id::text AS reference_id`,
    [
      transferOut.product_id,
      transferIn.location_id,
      userId,
      outQuantity,
      source.quantity_before,
      source.quantity_after,
      newReferenceId,
      notes,
      transferIn.movement_id,
      transferOut.location_id,
      destination.quantity_before,
      destination.quantity_after,
      transferOut.movement_id,
    ],
  );

  if (movementResult.rows.length !== 2) {
    throw new Error('Both reversal transfer records were not created.');
  }

  return {
    reference_id: newReferenceId,
    movements: movementResult.rows,
  };
}

// POST /api/stock-movements/:id/reverse
export async function reverseStockMovement(
  req: SessionAuthenticatedRequest,
  res: Response,
): Promise<void> {
  const movementId = req.params.id;

  if (
    typeof movementId !== 'string' ||
    !UUID_REGEX.test(movementId)
  ) {
    res.status(400).json({
      error: 'A valid movement ID is required.',
    });
    return;
  }

  let notes: string;

  try {
    notes = parseReversalNote(req.body);
  } catch (error) {
    if (error instanceof RequestError) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    throw error;
  }

  const userId = req.authenticatedUser?.id;

  if (!userId) {
    res.status(401).json({
      error: 'Authentication required.',
    });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      // Read first to determine whether this is a paired transfer.
      const initialResult = await client.query<OriginalMovement>(
        `SELECT
           movement_id,
           movement_no,
           product_id,
           location_id,
           movement_type,
           quantity_change::text AS quantity_change,
           reference_id::text AS reference_id,
           reference_no,
           reverses_movement_id
         FROM public.stock_movements
         WHERE movement_id = $1`,
        [movementId],
      );

      const initial = initialResult.rows[0];

      if (!initial) {
        throw new RequestError(404, 'Stock movement not found.');
      }

      if (initial.reverses_movement_id) {
        throw new RequestError(
          400,
          'A reversal movement cannot itself be reversed.',
        );
      }

      if (
        initial.movement_type === 'TRANSFER_IN' ||
        initial.movement_type === 'TRANSFER_OUT'
      ) {
        if (!initial.reference_id) {
          throw new RequestError(
            409,
            'The transfer does not have a reference ID.',
          );
        }

        return reverseTransfer(
          client,
          movementId,
          initial.reference_id,
          userId,
          notes,
        );
      }

      // Lock the individual original movement before checking its reversal.
      const lockedResult = await client.query<OriginalMovement>(
        `SELECT
           movement_id,
           movement_no,
           product_id,
           location_id,
           movement_type,
           quantity_change::text AS quantity_change,
           reference_id::text AS reference_id,
           reference_no,
           reverses_movement_id
         FROM public.stock_movements
         WHERE movement_id = $1
         FOR UPDATE`,
        [movementId],
      );

      const original = lockedResult.rows[0];

      if (!original) {
        throw new RequestError(404, 'Stock movement not found.');
      }

      return reverseOrdinaryMovement(
        client,
        original,
        userId,
        notes,
      );
    });

    res.status(200).json({
      message: 'Stock movement reversed successfully.',
      ...result,
    });
  } catch (error) {
    if (error instanceof TransactionConcurrencyError) {
      res.status(503).json({
        error: error.message,
      });
      return;
    }

    if (
      error instanceof RequestError ||
      error instanceof StockRuleError
    ) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    const pgError = error as PgError;

    if (
      pgError.code === '23505' ||
      pgError.constraint?.includes('revers')
    ) {
      res.status(409).json({
        error: 'This movement has already been reversed.',
      });
      return;
    }

    if (
      pgError.code === '23514' &&
      (
        pgError.constraint === 'inventory_quantity_nonnegative' ||
        pgError.constraint === 'stock_movements_after_nonnegative'
      )
    ) {
      res.status(409).json({
        error: 'Insufficient stock to reverse this movement.',
      });
      return;
    }

    console.error('Stock movement reversal failed:', error);

    res.status(500).json({
      error: 'Unable to reverse stock movement.',
    });
  }
}
