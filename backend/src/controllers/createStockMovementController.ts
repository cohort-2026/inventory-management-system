
import type { Response } from 'express';
import type { SessionAuthenticatedRequest } from '../middleware/requireSession';
import {
  withTransaction,
  TransactionConcurrencyError,
} from '../db/withTransaction';
import { StockRuleError } from '../services/stockRules';
import {
  postMovement,
  type MovementType,
  type PostMovementInput,
} from '../services/stockMovementService';

type CreateMovementInput = Omit<PostMovementInput, 'user_id'>;

type PgError = Error & {
  code?: string;
};

class RequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_MOVEMENT_TYPES = new Set<MovementType>([
  'RECEIPT',
  'SALE',
  'CUSTOMER_RETURN',
  'WRITE_OFF',
  'ADJUSTMENT',
]);

const FIELDS = new Set([
  'product_id',
  'location_id',
  'movement_type',
  'quantity',
  'reason_code_id',
  'direction',
  'reference_no',
  'notes',
]);

function parseCreateMovement(body: unknown): CreateMovementInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'Body must be a JSON object.');
  }

  const data = body as Record<string, unknown>;

  const unknown = Object.keys(data).filter(
    (field) => !FIELDS.has(field),
  );

  if (unknown.length > 0) {
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

  if (
    typeof data.movement_type !== 'string' ||
    !ALLOWED_MOVEMENT_TYPES.has(data.movement_type as MovementType)
  ) {
    throw new RequestError(
      400,
      'movement_type must be RECEIPT, SALE, CUSTOMER_RETURN, WRITE_OFF, or ADJUSTMENT.',
    );
  }

  if (
    typeof data.reason_code_id !== 'string' ||
    !UUID_REGEX.test(data.reason_code_id)
  ) {
    throw new RequestError(
      400,
      'reason_code_id must be a valid UUID.',
    );
  }

  if (
    data.direction !== undefined &&
    data.direction !== 'increase' &&
    data.direction !== 'decrease'
  ) {
    throw new RequestError(
      400,
      'direction must be increase or decrease.',
    );
  }

  if (
    data.reference_no !== undefined &&
    data.reference_no !== null &&
    (typeof data.reference_no !== 'string' ||
      !data.reference_no.trim() ||
      data.reference_no.trim().length > 60)
  ) {
    throw new RequestError(
      400,
      'reference_no must be a non-empty string of at most 60 characters.',
    );
  }

  if (
    data.notes !== undefined &&
    data.notes !== null &&
    (typeof data.notes !== 'string' ||
      data.notes.trim().length > 2000)
  ) {
    throw new RequestError(
      400,
      'notes must be a string or null (maximum 2000 characters).',
    );
  }

  const movementType = data.movement_type as MovementType;

  if (
    (movementType === 'RECEIPT' || movementType === 'SALE') &&
    (typeof data.reference_no !== 'string' || !data.reference_no.trim())
  ) {
    throw new RequestError(
      400,
      `reference_no is required for ${movementType}.`,
    );
  }

  if (
    movementType === 'ADJUSTMENT' &&
    data.direction !== 'increase' &&
    data.direction !== 'decrease'
  ) {
    throw new RequestError(
      400,
      'direction is required for ADJUSTMENT.',
    );
  }

  return {
    product_id: data.product_id,
    location_id: data.location_id,
    movement_type: movementType,
    quantity: data.quantity,
    reason_code_id: data.reason_code_id,
    ...(data.direction !== undefined
    ? { direction: data.direction as 'increase' | 'decrease' }
    : {}),
    reference_no:
      typeof data.reference_no === 'string'
        ? data.reference_no.trim()
        : null,
    notes:
      typeof data.notes === 'string'
        ? data.notes.trim() || null
        : null,
  };
}

// POST /api/stock-movements
export async function createStockMovement(
  req: SessionAuthenticatedRequest,
  res: Response,
): Promise<void> {
  let input: CreateMovementInput;

  try {
    input = parseCreateMovement(req.body);
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
    const movement = await withTransaction(async (client) => {
      return postMovement(client, {
        ...input,
        user_id: userId,
      });
    });

    res.status(201).json({ movement });
  } catch (error) {
    if (error instanceof TransactionConcurrencyError) {
      res.status(503).json({ error: error.message });
      return;
    }

    if (error instanceof StockRuleError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    if (error instanceof RequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    const pgError = error as PgError;

    if (pgError.code === '23514') {
      res.status(400).json({
        error: 'The movement violates a stock validation rule.',
      });
      return;
    }

    if (pgError.code === '23503') {
      res.status(400).json({
        error: 'One or more supplied references do not exist.',
      });
      return;
    }

    console.error('Stock movement creation failed:', error);

    res.status(500).json({
      error: 'Unable to create stock movement.',
    });
  }
}
