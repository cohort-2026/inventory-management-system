
import type { PoolClient } from 'pg';
import {
  StockRuleError,
  assertActiveStockProduct,
  parsePositiveStockQuantity,
  removeStockAtLocation,
} from './stockRules';

export type MovementType =
  | 'RECEIPT'
  | 'SALE'
  | 'CUSTOMER_RETURN'
  | 'WRITE_OFF'
  | 'ADJUSTMENT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'COUNT_VARIANCE';

export type MovementDirection = 'increase' | 'decrease';

export type PostMovementInput = {
  product_id: string;
  location_id: string;
  user_id: string;
  movement_type: MovementType;
  quantity: unknown;
  reason_code_id: string;
  direction?: MovementDirection;
  reference_no?: string | null;
  notes?: string | null;
};

export type PostedMovement = {
  movement_id: string;
  movement_no: string;
  product_id: string;
  location_id: string;
  user_id: string;
  movement_type: MovementType;
  quantity_change: string;
  quantity_before: string;
  quantity_after: string;
  reason_code_id: string;
  reason: string;
  reference_no: string | null;
  notes: string | null;
  created_at: Date;
};

type InventoryChange = {
  inventory_id: string;
  quantity_before: string;
  quantity_after: string;
};

type ReasonCodeRow = {
  reason_code_id: string;
  label: string;
  requires_note: boolean;
};

type ProductRow = {
  unit_of_measure: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const POSITIVE_MOVEMENT_TYPES = new Set<MovementType>([
  'RECEIPT',
  'CUSTOMER_RETURN',
  'TRANSFER_IN',
]);

const NEGATIVE_MOVEMENT_TYPES = new Set<MovementType>([
  'SALE',
  'WRITE_OFF',
  'TRANSFER_OUT',
]);

function validateUuid(value: string, field: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new StockRuleError(400, `${field} must be a valid UUID.`);
  }
}

function validateNote(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length > 2000) {
    throw new StockRuleError(
      400,
      'notes must be a string or null (maximum 2000 characters).',
    );
  }

  return value.trim() || null;
}

function getSignedQuantity(
  movementType: MovementType,
  quantity: string,
  direction?: MovementDirection,
): string {
  if (POSITIVE_MOVEMENT_TYPES.has(movementType)) {
    return quantity;
  }

  if (NEGATIVE_MOVEMENT_TYPES.has(movementType)) {
    return `-${quantity}`;
  }

  if (
    movementType === 'ADJUSTMENT' ||
    movementType === 'COUNT_VARIANCE'
  ) {
    if (direction !== 'increase' && direction !== 'decrease') {
      throw new StockRuleError(
        400,
        `direction must be increase or decrease for ${movementType}.`,
      );
    }

    return direction === 'increase' ? quantity : `-${quantity}`;
  }

  throw new StockRuleError(400, 'Unsupported movement type.');
}

/**
 * Posts one stock movement inside the caller's transaction.
 *
 * The caller must use withTransaction() and pass its PoolClient.
 * Inventory changes and the movement ledger insert therefore commit
 * or roll back together.
 *
 * Transfers must be handled as paired movements in a single operation;
 * do not use this function for standalone transfer records.
 */
export async function postMovement(
  client: PoolClient,
  input: PostMovementInput,
): Promise<PostedMovement> {
  validateUuid(input.product_id, 'product_id');
  validateUuid(input.location_id, 'location_id');
  validateUuid(input.user_id, 'user_id');
  validateUuid(input.reason_code_id, 'reason_code_id');

  if (
    input.movement_type === 'TRANSFER_IN' ||
    input.movement_type === 'TRANSFER_OUT'
  ) {
    throw new StockRuleError(
      400,
      'Transfers must be posted as a paired operation.',
    );
  }

  const quantity = parsePositiveStockQuantity(input.quantity);
  const notes = validateNote(input.notes);
  const signedQuantity = getSignedQuantity(
    input.movement_type,
    quantity,
    input.direction,
  );

  if (
    input.reference_no !== undefined &&
    input.reference_no !== null &&
    (typeof input.reference_no !== 'string' ||
      !input.reference_no.trim() ||
      input.reference_no.trim().length > 60)
  ) {
    throw new StockRuleError(
      400,
      'reference_no must be a non-empty string of at most 60 characters.',
    );
  }

  // Confirm that the product exists and is active.
  await assertActiveStockProduct(client, input.product_id);

  // Read the unit of measure while protecting the product row.
  const productResult = await client.query<ProductRow>(
    `SELECT unit_of_measure
     FROM public.products
     WHERE product_id = $1
     FOR SHARE`,
    [input.product_id],
  );

  const product = productResult.rows[0];

  if (!product) {
    throw new StockRuleError(404, 'Product not found.');
  }

  // Products measured as "each" cannot have fractional quantities.
  if (
    product.unit_of_measure.toLowerCase() === 'each' &&
    !/^\d+(?:\.0+)?$/.test(quantity)
  ) {
    throw new StockRuleError(
      400,
      'Products measured as each must use whole-number quantities.',
    );
  }

  // The location must exist and be active.
  const locationResult = await client.query<{ status: string }>(
    `SELECT status
     FROM public.locations
     WHERE location_id = $1
     FOR SHARE`,
    [input.location_id],
  );

  const location = locationResult.rows[0];

  if (!location) {
    throw new StockRuleError(404, 'Location not found.');
  }

  if (location.status !== 'active') {
    throw new StockRuleError(
      400,
      'Inactive locations cannot receive stock movements.',
    );
  }

  // A reason code must be active and belong to this movement type.
  const reasonResult = await client.query<ReasonCodeRow>(
    `SELECT reason_code_id, label, requires_note
     FROM public.reason_codes
     WHERE reason_code_id = $1
       AND movement_type = $2
       AND active = true`,
    [input.reason_code_id, input.movement_type],
  );

  const reasonCode = reasonResult.rows[0];

  if (!reasonCode) {
    throw new StockRuleError(
      400,
      'The selected reason code is invalid, inactive, or does not match the movement type.',
    );
  }

  if (reasonCode.requires_note && !notes) {
    throw new StockRuleError(
      400,
      'A note is required for the selected reason code.',
    );
  }

  // Apply the inventory change using exact PostgreSQL NUMERIC arithmetic.
  let inventory: InventoryChange | undefined;

  if (signedQuantity.startsWith('-')) {
    inventory = await removeStockAtLocation(
      client,
      input.product_id,
      input.location_id,
      quantity,
    );
  } else {
    const result = await client.query<InventoryChange>(
      `WITH changed AS (
         INSERT INTO public.inventory AS inv (
           product_id, location_id, quantity
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
      [input.product_id, input.location_id, quantity],
    );

    inventory = result.rows[0];
  }

  if (!inventory) {
    throw new Error('Inventory update returned no row.');
  }

  // Store the reason label as well as the new reason-code relationship.
  // This preserves compatibility with existing movement-history consumers.
  const movementResult = await client.query<PostedMovement>(
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
       notes
     )
     VALUES (
       $1, $2, $3, $4,
       $5::numeric, $6::numeric, $7::numeric,
       $8, $9, $10, $11
     )
     RETURNING
       movement_id,
       movement_no,
       product_id,
       location_id,
       user_id,
       movement_type,
       quantity_change::text AS quantity_change,
       quantity_before::text AS quantity_before,
       quantity_after::text AS quantity_after,
       reason_code_id,
       reason,
       reference_no,
       notes,
       created_at`,
    [
      input.product_id,
      input.location_id,
      input.user_id,
      input.movement_type,
      signedQuantity,
      inventory.quantity_before,
      inventory.quantity_after,
      input.reason_code_id,
      input.reference_no?.trim() || null,
      reasonCode.label,
      notes,
    ],
  );

  const movement = movementResult.rows[0];

  if (!movement) {
    throw new Error('Stock movement insert returned no row.');
  }

  return movement;
}
