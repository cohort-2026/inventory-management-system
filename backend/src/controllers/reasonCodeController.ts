
import type { Request, Response } from 'express';
import { dbPool } from '../db/pool';

const MOVEMENT_TYPES = new Set([
  'RECEIPT',
  'SALE',
  'CUSTOMER_RETURN',
  'WRITE_OFF',
  'ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'COUNT_VARIANCE',
]);

export async function getReasonCodes(
  req: Request,
  res: Response,
): Promise<void> {
  const movementType = req.query.movement_type;

  if (
    movementType !== undefined &&
    (typeof movementType !== 'string' ||
      !MOVEMENT_TYPES.has(movementType))
  ) {
    res.status(400).json({
      error: 'Invalid movement_type.',
    });
    return;
  }

  try {
    const result = await dbPool.query(
      `SELECT
         reason_code_id,
         movement_type,
         code,
         label,
         requires_note
       FROM public.reason_codes
       WHERE active = true
         AND ($1::varchar IS NULL OR movement_type = $1)
       ORDER BY movement_type, label`,
      [movementType ?? null],
    );

    res.status(200).json({
      reason_codes: result.rows,
    });
  } catch (error) {
    console.error('Fetching reason codes failed:', error);

    res.status(500).json({
      error: 'Unable to retrieve reason codes.',
    });
  }
}
