
import type { Request, Response } from 'express';
import { dbPool } from '../db/pool';

type MovementRow = {
  movement_id: string;
  movement_no: string;
  movement_type: string;
  reason_code_id: string | null;
  reason_code_label: string | null;
  reference_no: string | null;
  reverses_movement_id: string | null;
  product_id: string;
  product_name: string;
  sku: string;
  location_id: string;
  location_name: string;
  location_code: string;
  second_location_id: string | null;
  second_location_name: string | null;
  second_location_code: string | null;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  quantity_change: string;
  quantity_before: string;
  quantity_after: string;
  reference_id: string | null;
  reason: string | null;
  notes: string | null;
  created_at: Date;
};

class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_QUERY_PARAMETERS = new Set([
  'product_id',
  'location_id',
  'movement_type',
  'user_id',
  'reference_id',
  'from',
  'to',
  'page',
  'pageSize',
]);

function getOptionalString(
  value: unknown,
  name: string,
): string | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new QueryError(`${name} must be a single non-empty string.`);
  }

  return value.trim();
}

function validateUuid(
  value: string | null,
  name: string,
): void {
  if (value !== null && !UUID_REGEX.test(value)) {
    throw new QueryError(`${name} must be a valid UUID.`);
  }
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw new QueryError(`${name} must be a positive integer.`);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed > maximum
  ) {
    throw new QueryError(
      `${name} must be between 1 and ${maximum}.`,
    );
  }

  return parsed;
}

function parseDate(
  value: string | null,
  name: string,
): {
  value: string;
  dateOnly: boolean;
  timestamp: number;
} | null {
  if (value === null) {
    return null;
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);

  const validTimestamp = dateOnly
    ? /^\d{4}-\d{2}-\d{2}$/.test(value)
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

  const timestamp = Date.parse(value);

  if (!validTimestamp || !Number.isFinite(timestamp)) {
    throw new QueryError(
      `${name} must be a valid date (YYYY-MM-DD) or ISO timestamp with timezone.`,
    );
  }

  if (dateOnly) {
    const parts = value.split('-').map(Number);
    const [year, month, day] = parts;

    if (
      parts.length !== 3 ||
      year === undefined ||
      month === undefined ||
      day === undefined ||
      Number.isNaN(year) ||
      Number.isNaN(month) ||
      Number.isNaN(day)
    ) {
      throw new QueryError(
        'Invalid date format, expected YYYY-MM-DD.',
      );
    }

    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      throw new QueryError(
        `${name} must be a valid calendar date.`,
      );
    }
  }

  return { value, dateOnly, timestamp };
}

function getDateBoundary(
  date: { timestamp: number; dateOnly: boolean },
  isEndDate: boolean,
): number {
  if (isEndDate && date.dateOnly) {
    return date.timestamp + 24 * 60 * 60 * 1000 - 1;
  }

  return date.timestamp;
}

// GET /api/stock-movements
export async function getStockMovements(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const unknownParameters = Object.keys(req.query).filter(
      (key) => !ALLOWED_QUERY_PARAMETERS.has(key),
    );

    if (unknownParameters.length > 0) {
      throw new QueryError(
        `Unknown query parameter(s): ${unknownParameters.join(', ')}.`,
      );
    }

    const productId = getOptionalString(
      req.query.product_id,
      'product_id',
    );

    const locationId = getOptionalString(
      req.query.location_id,
      'location_id',
    );

    const userId = getOptionalString(
      req.query.user_id,
      'user_id',
    );

    const referenceId = getOptionalString(
      req.query.reference_id,
      'reference_id',
    );

    const rawMovementType = getOptionalString(
      req.query.movement_type,
      'movement_type',
    );

    const movementType = rawMovementType?.toUpperCase() ?? null;

    if (
      movementType !== null &&
      !/^[A-Z][A-Z0-9_]{0,49}$/.test(movementType)
    ) {
      throw new QueryError(
        'movement_type must contain only letters, numbers and underscores.',
      );
    }

    validateUuid(productId, 'product_id');
    validateUuid(locationId, 'location_id');
    validateUuid(userId, 'user_id');
    validateUuid(referenceId, 'reference_id');

    const fromValue = getOptionalString(req.query.from, 'from');
    const toValue = getOptionalString(req.query.to, 'to');

    const fromDate = parseDate(fromValue, 'from');
    const toDate = parseDate(toValue, 'to');

    if (
      fromDate &&
      toDate &&
      getDateBoundary(fromDate, false) >
        getDateBoundary(toDate, true)
    ) {
      throw new QueryError(
        'from must be earlier than or equal to to.',
      );
    }

    const page = parsePositiveInteger(
      req.query.page,
      1,
      1_000_000,
      'page',
    );

    const pageSize = parsePositiveInteger(
      req.query.pageSize,
      20,
      100,
      'pageSize',
    );

    const offset = (page - 1) * pageSize;

    if (!Number.isSafeInteger(offset)) {
      throw new QueryError('Requested page is too large.');
    }

    const values: unknown[] = [];
    const conditions: string[] = [];

    const addParameter = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (productId) {
      conditions.push(
        `sm.product_id = ${addParameter(productId)}::uuid`,
      );
    }

    if (locationId) {
      conditions.push(
        `sm.location_id = ${addParameter(locationId)}::uuid`,
      );
    }

    if (userId) {
      conditions.push(
        `sm.user_id = ${addParameter(userId)}::uuid`,
      );
    }

    if (referenceId) {
      conditions.push(
        `sm.reference_id = ${addParameter(referenceId)}::uuid`,
      );
    }

    if (movementType) {
      conditions.push(
        `UPPER(sm.movement_type) = ${addParameter(movementType)}`,
      );
    }

    if (fromDate) {
      if (fromDate.dateOnly) {
        conditions.push(
          `sm.created_at >= ${addParameter(fromDate.value)}::date`,
        );
      } else {
        conditions.push(
          `sm.created_at >= ${addParameter(fromDate.value)}::timestamptz`,
        );
      }
    }

    if (toDate) {
      if (toDate.dateOnly) {
        conditions.push(
          `sm.created_at < (${addParameter(toDate.value)}::date + INTERVAL '1 day')`,
        );
      } else {
        conditions.push(
          `sm.created_at <= ${addParameter(toDate.value)}::timestamptz`,
        );
      }
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const countResult = await dbPool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.stock_movements AS sm
       ${whereClause}`,
      values,
    );

    const total = Number(countResult.rows[0]?.total ?? '0');

    const limitParameter = addParameter(pageSize);
    const offsetParameter = addParameter(offset);

    const rowsResult = await dbPool.query<MovementRow>(
      `SELECT
         sm.movement_id,
         sm.movement_no,
         sm.movement_type,
         sm.reason_code_id,
         rc.label AS reason_code_label,
         sm.reference_no,
         sm.reverses_movement_id,

         sm.product_id,
         p.name AS product_name,
         p.sku,

         sm.location_id,
         l.name AS location_name,
         l.code AS location_code,

         second_location.location_id AS second_location_id,
         second_location.name AS second_location_name,
         second_location.code AS second_location_code,

         sm.user_id,
         u.first_name,
         u.last_name,
         u.email,

         sm.quantity_change::text AS quantity_change,
         sm.quantity_before::text AS quantity_before,
         sm.quantity_after::text AS quantity_after,

         sm.reference_id::text AS reference_id,
         sm.reason,
         sm.notes,
         sm.created_at

       FROM public.stock_movements AS sm

       JOIN public.products AS p
         ON p.product_id = sm.product_id

       JOIN public.locations AS l
         ON l.location_id = sm.location_id

       JOIN public.users AS u
         ON u.user_id = sm.user_id

       LEFT JOIN public.reason_codes AS rc
         ON rc.reason_code_id = sm.reason_code_id

       LEFT JOIN public.stock_movements AS paired
         ON sm.reference_id IS NOT NULL
         AND paired.reference_id = sm.reference_id
         AND paired.product_id = sm.product_id
         AND paired.movement_id <> sm.movement_id
         AND (
           (
             sm.movement_type = 'TRANSFER_OUT'
             AND paired.movement_type = 'TRANSFER_IN'
           )
           OR
           (
             sm.movement_type = 'TRANSFER_IN'
             AND paired.movement_type = 'TRANSFER_OUT'
           )
         )

       LEFT JOIN public.locations AS second_location
         ON second_location.location_id = paired.location_id

       ${whereClause}

       ORDER BY sm.created_at DESC, sm.movement_id DESC
       LIMIT ${limitParameter}
       OFFSET ${offsetParameter}`,
      values,
    );

    const items = rowsResult.rows.map((row) => ({
      movement_id: row.movement_id,
      movement_no: row.movement_no,
      movement_type: row.movement_type,

      reason_code_id: row.reason_code_id,
      reason_code: row.reason_code_label,

      reference_no: row.reference_no,
      reverses_movement_id: row.reverses_movement_id,

      product: {
        product_id: row.product_id,
        name: row.product_name,
        sku: row.sku,
      },

      location: {
        location_id: row.location_id,
        name: row.location_name,
        code: row.location_code,
      },

      second_location: row.second_location_id
        ? {
            location_id: row.second_location_id,
            name: row.second_location_name,
            code: row.second_location_code,
          }
        : null,

      quantity_change: row.quantity_change,
      quantity_before: row.quantity_before,
      quantity_after: row.quantity_after,

      user: {
        user_id: row.user_id,
        name:
          [row.first_name, row.last_name]
            .filter(Boolean)
            .join(' ') || row.email,
        email: row.email,
      },

      created_at: row.created_at,
      reason: row.reason,
      notes: row.notes,
      reference_id: row.reference_id,
    }));

    res.status(200).json({
      items,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    if (error instanceof QueryError) {
      res.status(400).json({ error: error.message });
      return;
    }

    console.error('Get stock movements failed:', error);

    res.status(500).json({
      error: 'Unable to retrieve stock movement history.',
    });
  }
}
