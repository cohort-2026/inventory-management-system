
import type { Request, Response } from 'express';
import type { RoleAuthenticatedRequest } from '../middleware/customRequireRole';
import { dbPool } from '../db/pool';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPES = new Set([
  'RECEIPT',
  'SALE',
  'CUSTOMER_RETURN',
  'WRITE_OFF',
  'ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'COUNT_VARIANCE',
  'COUNT',
  'IN',
  'OUT',
]);

const KEYS = new Set([
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

class InputError extends Error {}

class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessError';
  }
}

type Filter = {
  where: string;
  values: unknown[];
  page: number;
  pageSize: number;
};

type RecordRow = Record<string, unknown>;

type MovementAccess = {
  homeLocationId: string | null;
  scoped: boolean;
};

// Determine which warehouse the authenticated user can access.
async function getMovementAccess(
  req: RoleAuthenticatedRequest,
): Promise<MovementAccess> {
  const userId = req.authenticatedUser?.id;
  const role = req.resolvedRole;

  if (!userId) {
    throw new AccessError('Authentication required.');
  }

  if (!role) {
    throw new AccessError('User role could not be verified.');
  }

  // Managers and Viewers retain access across all warehouses.
  if (role === 'Manager' || role === 'Viewer') {
    return {
      homeLocationId: null,
      scoped: false,
    };
  }

  // Inventory Staff are restricted to their assigned warehouse.
  if (role === 'Inventory Staff') {
    const result = await dbPool.query<{
      home_location_id: string | null;
    }>(
      `SELECT home_location_id
       FROM public.users
       WHERE user_id = $1
         AND status = 'active'
       LIMIT 1`,
      [userId],
    );

    const homeLocationId = result.rows[0]?.home_location_id;

    if (!homeLocationId) {
      throw new AccessError(
        'No warehouse has been assigned to your account.',
      );
    }

    return {
      homeLocationId,
      scoped: true,
    };
  }

  throw new AccessError(
    'You do not have permission to access stock movement history.',
  );
}

function optional(
  query: Request['query'],
  name: string,
): string | null {
  const value = query[name];

  if (value === undefined) return null;

  if (typeof value !== 'string' || !value.trim()) {
    throw new InputError(
      `${name} must be one non-empty string.`,
    );
  }

  return value.trim();
}

function date(
  value: string | null,
  name: string,
): string | null {
  if (!value) return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);

  const iso =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
      value,
    );

  if (
    (!dateOnly && !iso) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new InputError(
      `${name} must be YYYY-MM-DD or an ISO timestamp with timezone.`,
    );
  }

  if (
    dateOnly &&
    new Date(`${value}T00:00:00Z`)
      .toISOString()
      .slice(0, 10) !== value
  ) {
    throw new InputError(`${name} is not a calendar date.`);
  }

  return value;
}

function integer(
  query: Request['query'],
  name: string,
  fallback: number,
  max: number,
): number {
  const value = query[name];

  if (value === undefined) return fallback;

  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > max
  ) {
    throw new InputError(
      `${name} must be between 1 and ${max}.`,
    );
  }

  return Number(value);
}

function parseFilters(req: Request): Filter {
  const unknown = Object.keys(req.query).filter(
    (key) => !KEYS.has(key),
  );

  if (unknown.length) {
    throw new InputError(
      `Unknown parameter(s): ${unknown.join(', ')}.`,
    );
  }

  const values: unknown[] = [];
  const conditions: string[] = [];

  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  for (const name of [
    'product_id',
    'location_id',
    'user_id',
    'reference_id',
  ]) {
    const value = optional(req.query, name);

    if (value) {
      if (!UUID.test(value)) {
        throw new InputError(`${name} must be a UUID.`);
      }

      conditions.push(
        `sm.${name} = ${add(value)}::uuid`,
      );
    }
  }

  const types = optional(req.query, 'movement_type');

  if (types) {
    const selected = types.toUpperCase().split(',');

    if (
      selected.length > 20 ||
      selected.some((type) => !TYPES.has(type)) ||
      new Set(selected).size !== selected.length
    ) {
      throw new InputError(
        'Invalid or repeated movement_type. Use comma-separated movement types.',
      );
    }

    conditions.push(
      `UPPER(sm.movement_type) = ANY(${add(selected)}::text[])`,
    );
  }

  const from = date(
    optional(req.query, 'from'),
    'from',
  );

  const to = date(
    optional(req.query, 'to'),
    'to',
  );

  const bound = (value: string, end: boolean) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? Date.parse(`${value}T00:00:00Z`) +
        (end ? 86400000 - 1 : 0)
      : Date.parse(value);

  if (
    from &&
    to &&
    bound(from, false) > bound(to, true)
  ) {
    throw new InputError(
      'from must be earlier than or equal to to.',
    );
  }

  if (from) {
    conditions.push(
      /^\d{4}-\d{2}-\d{2}$/.test(from)
        ? `sm.created_at >= ${add(from)}::date`
        : `sm.created_at >= ${add(from)}::timestamptz`,
    );
  }

  if (to) {
    conditions.push(
      /^\d{4}-\d{2}-\d{2}$/.test(to)
        ? `sm.created_at < (${add(to)}::date + INTERVAL '1 day')`
        : `sm.created_at <= ${add(to)}::timestamptz`,
    );
  }

  return {
    where: conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '',
    values,
    page: integer(req.query, 'page', 1, 1_000_000),
    pageSize: integer(req.query, 'pageSize', 50, 100),
  };
}

// Apply the assigned warehouse restriction to every movement query.
function applyWarehouseScope(
  filter: Filter,
  homeLocationId: string | null,
): Filter {
  if (!homeLocationId) return filter;

  const values = [...filter.values, homeLocationId];

  const condition =
    `sm.location_id = $${values.length}::uuid`;

  return {
    ...filter,
    where: filter.where
      ? `${filter.where} AND ${condition}`
      : `WHERE ${condition}`,
    values,
  };
}

const ORDER =
  'ORDER BY sm.created_at DESC, sm.movement_id DESC';

// Build the movement query.
// For Inventory Staff, paired movements in other warehouses
// are deliberately hidden.
function selectSql(scoped: boolean): string {
  const pairedLocationCondition = scoped
    ? 'AND other.location_id = sm.location_id'
    : '';

  return `SELECT
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
    paired.movement_id AS paired_movement_id,
    second_location.location_id AS second_location_id,
    second_location.name AS second_location_name,
    second_location.code AS second_location_code,
    sm.user_id,
    u.first_name,
    u.last_name,
    u.email,
    sm.quantity_change::text,
    sm.quantity_before::text,
    sm.quantity_after::text,
    sm.reference_id::text,
    sm.reason,
    sm.notes,
    sm.created_at
  FROM public.stock_movements sm
  JOIN public.products p
    ON p.product_id = sm.product_id
  JOIN public.locations l
    ON l.location_id = sm.location_id
  JOIN public.users u
    ON u.user_id = sm.user_id
  LEFT JOIN public.reason_codes rc
    ON rc.reason_code_id = sm.reason_code_id
  LEFT JOIN LATERAL (
    SELECT
      other.movement_id,
      other.location_id
    FROM public.stock_movements other
    WHERE sm.reference_id IS NOT NULL
      AND other.reference_id = sm.reference_id
      AND other.product_id = sm.product_id
      AND other.movement_id <> sm.movement_id
      ${pairedLocationCondition}
      AND (
        (sm.movement_type = 'TRANSFER_OUT'
          AND other.movement_type = 'TRANSFER_IN')
        OR
        (sm.movement_type = 'TRANSFER_IN'
          AND other.movement_type = 'TRANSFER_OUT')
      )
    ORDER BY other.created_at, other.movement_id
    LIMIT 1
  ) paired ON TRUE
  LEFT JOIN public.locations second_location
    ON second_location.location_id = paired.location_id`;
}

function shape(r: RecordRow) {
  return {
    movement_id: r.movement_id,
    movement_no: r.movement_no,
    movement_type: r.movement_type,
    reason_code_id: r.reason_code_id,
    reason_code: r.reason_code_label,
    reference_no: r.reference_no,
    reverses_movement_id: r.reverses_movement_id,

    product: {
      product_id: r.product_id,
      name: r.product_name,
      sku: r.sku,
    },

    location: {
      location_id: r.location_id,
      name: r.location_name,
      code: r.location_code,
    },

    second_location: r.second_location_id
      ? {
          location_id: r.second_location_id,
          name: r.second_location_name,
          code: r.second_location_code,
        }
      : null,

    paired_movement_id: r.paired_movement_id,

    quantity_change: r.quantity_change,
    quantity_before: r.quantity_before,
    quantity_after: r.quantity_after,

    user: {
      user_id: r.user_id,
      name:
        [r.first_name, r.last_name]
          .filter(Boolean)
          .join(' ') || r.email,
      email: r.email,
    },

    created_at: r.created_at,
    reason: r.reason,
    notes: r.notes,
    reference_id: r.reference_id,
  };
}

function failure(
  res: Response,
  err: unknown,
  action: string,
) {
  if (err instanceof InputError) {
    res.status(400).json({
      error: err.message,
    });
    return;
  }

  if (err instanceof AccessError) {
    const statusCode = err.message === 'Authentication required.'
      ? 401
      : 403;

    res.status(statusCode).json({
      error: err.message,
    });
    return;
  }

  console.error(action, err);

  res.status(500).json({
    error: 'Unable to retrieve stock movement history.',
  });
}

// GET stock movement history.
export async function getStockMovements(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const access = await getMovementAccess(req);
    const f = applyWarehouseScope(
      parseFilters(req),
      access.homeLocationId,
    );

    const count = await dbPool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.stock_movements sm
       ${f.where}`,
      f.values,
    );

    const offset = (f.page - 1) * f.pageSize;

    if (!Number.isSafeInteger(offset)) {
      throw new InputError(
        'Requested page is too large.',
      );
    }

    const rows = await dbPool.query<RecordRow>(
      `${selectSql(access.scoped)}
       ${f.where}
       ${ORDER}
       LIMIT $${f.values.length + 1}
       OFFSET $${f.values.length + 2}`,
      [...f.values, f.pageSize, offset],
    );

    res.json({
      items: rows.rows.map(shape),
      total: Number(count.rows[0]?.total ?? 0),
      page: f.page,
      pageSize: f.pageSize,
    });
  } catch (error) {
    failure(
      res,
      error,
      'List movements failed:',
    );
  }
}

// GET an individual stock movement and its related records.
export async function getStockMovementDetail(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const access = await getMovementAccess(req);
    const id = req.params.id;

    if (typeof id !== 'string' || !UUID.test(id)) {
      throw new InputError('Invalid movement ID.');
    }

    const scopeCondition = access.homeLocationId
      ? 'AND sm.location_id = $2::uuid'
      : '';

    const sourceValues: unknown[] = access.homeLocationId
      ? [id, access.homeLocationId]
      : [id];

    const movement = await dbPool.query<RecordRow>(
      `${selectSql(access.scoped)}
       WHERE sm.movement_id = $1::uuid
       ${scopeCondition}`,
      sourceValues,
    );

    const source = movement.rows[0];

    if (!source) {
      res.status(404).json({
        error: 'Movement not found.',
      });
      return;
    }

    // Fetch linked movements only within the assigned warehouse.
    const linkedScope = access.homeLocationId
      ? 'AND sm.location_id = $3::uuid'
      : '';

    const linkedValues: unknown[] = access.homeLocationId
      ? [
          source.reference_id,
          id,
          access.homeLocationId,
        ]
      : [source.reference_id, id];

    const linked = source.reference_id
      ? await dbPool.query<RecordRow>(
          `${selectSql(access.scoped)}
           WHERE sm.reference_id = $1::uuid
             AND sm.movement_id <> $2::uuid
             ${linkedScope}
           ${ORDER}
           LIMIT 100`,
          linkedValues,
        )
      : { rows: [] as RecordRow[] };

    // Fetch reversal movements only within the assigned warehouse.
    const reversalScope = access.homeLocationId
      ? 'AND sm.location_id = $2::uuid'
      : '';

    const reversalValues: unknown[] = access.homeLocationId
      ? [id, access.homeLocationId]
      : [id];

    const reversals = await dbPool.query<RecordRow>(
      `${selectSql(access.scoped)}
       WHERE sm.reverses_movement_id = $1::uuid
       ${reversalScope}
       ${ORDER}`,
      reversalValues,
    );

    // Combine linked movements and reversals without duplicates.
    const related = new Map<
      string,
      ReturnType<typeof shape>
    >();

    for (const record of [
      ...linked.rows,
      ...reversals.rows,
    ]) {
      related.set(
        String(record.movement_id),
        shape(record),
      );
    }

    res.json({
      movement: shape(source),
      linked: [...related.values()],
    });
  } catch (error) {
    failure(
      res,
      error,
      'Movement detail failed:',
    );
  }
}

function csvCell(value: unknown): string {
  const string =
    value === null || value === undefined
      ? ''
      : String(value);

  // Quote all strings and neutralise spreadsheet formula injection.
  const safe = /^[\s]*[=+@\-\t\r]/.test(string)
    ? `'${string}`
    : string;

  return `"${safe.replace(/"/g, '""')}"`;
}

function csvQuantity(value: unknown): string {
  const string = String(value ?? '');

  return /^-?\d+(?:\.\d+)?$/.test(string)
    ? string
    : csvCell(value);
}

// Export stock movement history.
export async function exportStockMovementsCsv(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const access = await getMovementAccess(req);
    const f = applyWarehouseScope(
      parseFilters(req),
      access.homeLocationId,
    );

    // Export ignores page/pageSize and covers all filtered rows.
    const count = await dbPool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.stock_movements sm
       ${f.where}`,
      f.values,
    );

    if (
      Number(count.rows[0]?.total ?? 0) > 10000
    ) {
      res.status(413).json({
        error: 'Export exceeds 10,000 rows. Narrow the filters.',
      });
      return;
    }

    const rows = await dbPool.query<RecordRow>(
      `${selectSql(access.scoped)}
       ${f.where}
       ${ORDER}`,
      f.values,
    );

    const headers = [
      'Movement no',
      'Date/time UTC',
      'Type',
      'Product',
      'SKU',
      'Location',
      'Other location',
      'Change',
      'Balance before',
      'Balance after',
      'User',
      'Reason code',
      'Reason',
      'Reference',
      'Notes',
    ];

    const lines = [
      headers.map(csvCell).join(','),
    ];

    for (const record of rows.rows) {
      const movement = shape(record);

      lines.push(
        [
          movement.movement_no,
          new Date(
            movement.created_at as string,
          ).toISOString(),
          movement.movement_type,
          movement.product.name,
          movement.product.sku,
          movement.location.name,
          movement.second_location?.name ?? '',
          movement.quantity_change,
          movement.quantity_before,
          movement.quantity_after,
          movement.user.name,
          movement.reason_code,
          movement.reason,
          movement.reference_no ?? movement.reference_id,
          movement.notes,
        ]
          .map((value, index) =>
            index >= 7 && index <= 9
              ? csvQuantity(value)
              : csvCell(value),
          )
          .join(','),
      );
    }

    res.setHeader(
      'Content-Type',
      'text/csv; charset=utf-8',
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="stock-movements.csv"',
    );

    res.setHeader('Cache-Control', 'no-store');

    res.send(
      `\uFEFF${lines.join('\r\n')}\r\n`,
    );
  } catch (error) {
    failure(
      res,
      error,
      'Movement export failed:',
    );
  }
}

// GET users who have recorded stock movements.
export async function getMovementActors(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const access = await getMovementAccess(req);

    const values: unknown[] = [];
    let scope = '';

    if (access.homeLocationId) {
      values.push(access.homeLocationId);
      scope = 'AND sm.location_id = $1::uuid';
    }

    const rows = await dbPool.query<{
      user_id: string;
      name: string;
    }>(
      `SELECT DISTINCT
         u.user_id,
         COALESCE(
           NULLIF(
             TRIM(CONCAT_WS(' ', u.first_name, u.last_name)),
             ''
           ),
           u.email
         ) AS name
       FROM public.users u
       JOIN public.stock_movements sm
         ON sm.user_id = u.user_id
       WHERE 1 = 1
         ${scope}
       ORDER BY name, u.user_id`,
      values,
    );

    res.json({
      items: rows.rows,
    });
  } catch (error) {
    failure(
      res,
      error,
      'Movement actors failed:',
    );
  }
}
