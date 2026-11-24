
import type { Response } from 'express';
import { dbPool } from '../db/pool';
import {
  calculateInventoryStatus,
  STOCK_STATUS_LABELS,
} from '../services/inventoryStatus';
import type {
  RoleAuthenticatedRequest,
} from '../middleware/customRequireRole';

type Status = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

type Filters = {
  search: string;
  location: string;
  category: string;
  status: Status | '';
  selected: string[];
};

type InventoryRow = {
  inventory_id: string | null;
  product_id: string;
  location_id: string;
  name: string;
  sku: string;
  category_id: string;
  category_name: string;
  location_name: string;
  location_code: string;
  quantity: string;
  reorder_level: string;
  updated_at: Date | null;
  last_movement_at: Date | null;
};

type InventoryAccess = {
  role: 'Manager' | 'Inventory Staff' | 'Viewer';
  homeLocationId: string | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_EXPORT = 10_000;

function one(
  req: RoleAuthenticatedRequest,
  key: string,
): string | undefined {
  const value = req.query[key];

  if (value === undefined) return undefined;

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a single string.`);
  }

  return value;
}

function positive(
  value: string | undefined,
  fallback: number,
  max: number,
  name: string,
): number {
  if (value === undefined) return fallback;

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const n = Number(value);

  if (!Number.isSafeInteger(n) || n > max) {
    throw new Error(`${name} must be at most ${max}.`);
  }

  return n;
}

function parseFilters(
  req: RoleAuthenticatedRequest,
  allowSelected = false,
): Filters {
  const keys = new Set([
    'search',
    'location',
    'category',
    'status',
    'page',
    'pageSize',
  ]);

  if (allowSelected) keys.add('selected');

  for (const key of Object.keys(req.query)) {
    if (!keys.has(key)) {
      throw new Error(`Unknown query parameter: ${key}.`);
    }
  }

  const search = (one(req, 'search') ?? '').trim();
  const location = one(req, 'location') ?? '';
  const category = one(req, 'category') ?? '';
  const status = (one(req, 'status') ?? '') as Status | '';

  if (search.length > 200) {
    throw new Error('search cannot exceed 200 characters.');
  }

  if (location && !UUID.test(location)) {
    throw new Error('Invalid location ID.');
  }

  if (category && !UUID.test(category)) {
    throw new Error('Invalid category ID.');
  }

  if (
    status &&
    !['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(status)
  ) {
    throw new Error('Invalid stock status.');
  }

  const rawSelected = one(req, 'selected') ?? '';
  const selected = rawSelected ? rawSelected.split(',') : [];

  if (selected.length > 100) {
    throw new Error('Select at most 100 product/location rows.');
  }

  if (
    selected.some(
      (item) =>
        !new RegExp(
          `^${UUID.source.slice(1, -1)}:${UUID.source.slice(1, -1)}$`,
          'i',
        ).test(item),
    )
  ) {
    throw new Error('selected must contain productId:locationId pairs.');
  }

  return {
    search,
    location,
    category,
    status,
    selected,
  };
}

/**
 * Resolve the authenticated user's inventory access.
 *
 * The role is populated by customRequireRole().
 * The warehouse assignment is read from the database,
 * not accepted from a frontend query parameter.
 */
async function getInventoryAccess(
  req: RoleAuthenticatedRequest,
): Promise<InventoryAccess> {
  const user = req.authenticatedUser;
  const role = req.resolvedRole;

  if (!user || !role) {
    throw new Error('Authenticated user or role is unavailable.');
  }

  if (role === 'Manager') {
    return {
      role,
      homeLocationId: null,
    };
  }

  if (role === 'Viewer') {
    return {
      role,
      homeLocationId: null,
    };
  }

  const result = await dbPool.query<{
    home_location_id: string | null;
  }>(
    `
      SELECT home_location_id
      FROM public.users
      WHERE user_id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [user.id],
  );

  const homeLocationId =
    result.rows[0]?.home_location_id ?? null;

  if (!homeLocationId) {
    throw new Error('NO_HOME_WAREHOUSE_ASSIGNED');
  }

  return {
    role,
    homeLocationId,
  };
}

// The product/location cross join is the source of truth.
// An absent inventory row represents zero, not an invented database ID.
const BASE = `
FROM public.products p
CROSS JOIN public.locations l
LEFT JOIN public.inventory i
  ON i.product_id = p.product_id
  AND i.location_id = l.location_id
LEFT JOIN public.categories c
  ON c.category_id = p.category_id
WHERE p.status = 'active'
  AND l.status = 'active'
`;

function where(
  f: Filters,
  access: InventoryAccess,
): { sql: string; values: unknown[] } {
  const values: unknown[] = [
    f.search,
    f.location || null,
    f.category || null,
    f.status || null,
    access.homeLocationId,
  ];

  let sql = `${BASE}
  AND (
    $1::text = ''
    OR STRPOS(LOWER(p.name), LOWER($1::text)) > 0
    OR STRPOS(LOWER(p.sku), LOWER($1::text)) > 0
  )
  AND ($2::uuid IS NULL OR l.location_id = $2::uuid)
  AND ($3::uuid IS NULL OR p.category_id = $3::uuid)
  AND ($4::text IS NULL OR
    CASE
      WHEN COALESCE(i.quantity, 0) = 0
        THEN 'OUT_OF_STOCK'
      WHEN COALESCE(i.quantity, 0) < p.reorder_level
        THEN 'LOW_STOCK'
      ELSE 'IN_STOCK'
    END = $4::text
  )
  AND (
    $5::uuid IS NULL
    OR l.location_id = $5::uuid
  )
`;

  if (f.selected.length) {
    values.push(f.selected.map((item) => item.toLowerCase()));

    sql += `
      AND (
        p.product_id::text || ':' || l.location_id::text
      ) = ANY($6::text[])
    `;
  }

  return { sql, values };
}

function shape(row: InventoryRow) {
  const stockStatus = calculateInventoryStatus(
    row.quantity,
    row.reorder_level,
  );

  return {
    id: `${row.product_id}:${row.location_id}`,
    inventory_id: row.inventory_id,
    product_id: row.product_id,
    location_id: row.location_id,
    name: row.name,
    sku: row.sku,
    category_id: row.category_id,
    category_name: row.category_name,
    location_name: row.location_name,
    location_code: row.location_code,
    quantity: row.quantity,
    reorder_level: row.reorder_level,
    stock_status: stockStatus,
    status: STOCK_STATUS_LABELS[stockStatus],
    updated_at: row.updated_at,
    last_movement_at: row.last_movement_at,
  };
}

const FIELDS = `
SELECT
  i.inventory_id,
  p.product_id,
  l.location_id,
  p.name,
  p.sku,
  p.category_id,
  COALESCE(c.name, 'Uncategorised') AS category_name,
  l.name AS location_name,
  l.code AS location_code,
  COALESCE(i.quantity, 0)::text AS quantity,
  p.reorder_level::text AS reorder_level,
  i.updated_at,
  (
    SELECT sm.created_at
    FROM public.stock_movements sm
    WHERE sm.product_id = p.product_id
      AND sm.location_id = l.location_id
    ORDER BY sm.created_at DESC, sm.movement_id DESC
    LIMIT 1
  ) AS last_movement_at
`;

const ORDER = `
ORDER BY
  p.name ASC,
  p.sku ASC,
  l.name ASC,
  p.product_id ASC,
  l.location_id ASC
`;

function badRequest(
  res: Response,
  error: unknown,
): void {
  res.status(400).json({
    error:
      error instanceof Error
        ? error.message
        : 'Invalid request.',
  });
}

function accessError(
  res: Response,
  error: unknown,
): void {
  if (
    error instanceof Error &&
    error.message === 'NO_HOME_WAREHOUSE_ASSIGNED'
  ) {
    res.status(403).json({
      error: 'No home warehouse is assigned to this account.',
    });
    return;
  }

  console.error('Inventory access resolution failed:', error);

  res.status(500).json({
    error: 'Unable to verify inventory access.',
  });
}

export async function getInventory(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  let f: Filters;
  let page: number;
  let pageSize: number;
  let access: InventoryAccess;

  try {
    f = parseFilters(req);
    page = positive(one(req, 'page'), 1, 1_000_000, 'page');
    pageSize = positive(one(req, 'pageSize'), 50, 100, 'pageSize');
  } catch (error) {
    badRequest(res, error);
    return;
  }

  try {
    access = await getInventoryAccess(req);
  } catch (error) {
    accessError(res, error);
    return;
  }

  const q = where(f, access);

  try {
    const count = await dbPool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total ${q.sql}`,
      q.values,
    );

    const rows = await dbPool.query<InventoryRow>(
      `${FIELDS} ${q.sql} ${ORDER}
       LIMIT $${q.values.length + 1}
       OFFSET $${q.values.length + 2}`,
      [
        ...q.values,
        pageSize,
        (page - 1) * pageSize,
      ],
    );

    res.json({
      items: rows.rows.map(shape),
      page,
      pageSize,
      total: Number(count.rows[0]?.total ?? 0),
    });
  } catch (error) {
    console.error('Get inventory failed:', error);

    res.status(500).json({
      error: 'Unable to retrieve inventory.',
    });
  }
}

// Summary ignores the selected status, but retains
// location/category/search and authenticated warehouse restrictions.
export async function getInventorySummary(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  let f: Filters;
  let access: InventoryAccess;

  try {
    f = parseFilters(req);
  } catch (error) {
    badRequest(res, error);
    return;
  }

  try {
    access = await getInventoryAccess(req);
  } catch (error) {
    accessError(res, error);
    return;
  }

  const q = where(
    {
      ...f,
      status: '',
    },
    access,
  );

  try {
    const result = await dbPool.query<{
      total: string;
      in_stock: string;
      low_stock: string;
      out_of_stock: string;
    }>(
      `
        SELECT
          COUNT(*)::text AS total,

          COUNT(*) FILTER (
            WHERE COALESCE(i.quantity, 0) > 0
              AND COALESCE(i.quantity, 0) >= p.reorder_level
          )::text AS in_stock,

          COUNT(*) FILTER (
            WHERE COALESCE(i.quantity, 0) > 0
              AND COALESCE(i.quantity, 0) < p.reorder_level
          )::text AS low_stock,

          COUNT(*) FILTER (
            WHERE COALESCE(i.quantity, 0) = 0
          )::text AS out_of_stock

        ${q.sql}
      `,
      q.values,
    );

    const row = result.rows[0];

    res.json({
      total: Number(row?.total ?? 0),
      in_stock: Number(row?.in_stock ?? 0),
      low_stock: Number(row?.low_stock ?? 0),
      out_of_stock: Number(row?.out_of_stock ?? 0),
    });
  } catch (error) {
    console.error('Inventory summary failed:', error);

    res.status(500).json({
      error: 'Unable to retrieve inventory summary.',
    });
  }
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);

  // Neutralise spreadsheet formula injection,
  // including whitespace-prefixed formulas.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text)
    ? `'${text}`
    : text;

  return `"${safe.replace(/"/g, '""')}"`;
}

export async function exportInventoryCsv(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  let f: Filters;
  let access: InventoryAccess;

  try {
    f = parseFilters(req, true);
  } catch (error) {
    badRequest(res, error);
    return;
  }

  try {
    access = await getInventoryAccess(req);
  } catch (error) {
    accessError(res, error);
    return;
  }

  const q = where(f, access);

  try {
    const rows = await dbPool.query<InventoryRow>(
      `${FIELDS} ${q.sql} ${ORDER} LIMIT ${MAX_EXPORT + 1}`,
      q.values,
    );

    if (rows.rows.length > MAX_EXPORT) {
      res.status(409).json({
        error:
          'More than 10,000 records match. Narrow the filters before exporting.',
      });
      return;
    }

    const lines = [
      [
        'Product',
        'SKU',
        'Category',
        'Location',
        'Location code',
        'On hand',
        'Minimum',
        'Status',
        'Last movement',
      ].map(csvCell).join(','),

      ...rows.rows.map((row) => {
        const value = shape(row);

        return [
          value.name,
          value.sku,
          value.category_name,
          value.location_name,
          value.location_code,
          value.quantity,
          value.reorder_level,
          value.status,
          value.last_movement_at?.toISOString() ?? '',
        ].map(csvCell).join(',');
      }),
    ];

    res.setHeader(
      'Content-Type',
      'text/csv; charset=utf-8',
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="stock-on-hand.csv"',
    );

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).send(
      '\uFEFF' + lines.join('\r\n') + '\r\n',
    );
  } catch (error) {
    console.error('Inventory CSV failed:', error);

    res.status(500).json({
      error: 'Unable to export inventory.',
    });
  }
}
