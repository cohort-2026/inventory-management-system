
import { Router } from 'express';

import { dbPool } from '../db/pool';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

const ALLOWED_FIELDS = new Set([
  'category_id',
  'name',
  'sku',
  'description',
  'unit_of_measure',
  'reorder_level',
  'status',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProductInput = {
  category_id: string;
  name: string;
  sku: string;
  description: string | null;
  unit_of_measure: string;
  reorder_level: number;
  status: 'active' | 'archived';
};

type ProductRow = {
  product_id: string;
  category_id: string;
  name: string;
  sku: string;
  description: string | null;
  unit_of_measure: string;
  reorder_level: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type DatabaseError = Error & {
  code?: string;
  constraint?: string;
};

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validateProduct(
  body: unknown,
):
  | { valid: true; data: ProductInput }
  | { valid: false; error: string } {
  if (!isObject(body)) {
    return {
      valid: false,
      error: 'Request body must be a JSON object.',
    };
  }

  const unknownFields = Object.keys(body).filter(
    (field) => !ALLOWED_FIELDS.has(field),
  );

  if (unknownFields.length > 0) {
    return {
      valid: false,
      error: `Unknown field(s): ${unknownFields.join(', ')}.`,
    };
  }

  if (
    typeof body.category_id !== 'string' ||
    !UUID_PATTERN.test(body.category_id)
  ) {
    return {
      valid: false,
      error: 'category_id must be a valid UUID.',
    };
  }

  if (
    typeof body.name !== 'string' ||
    !body.name.trim()
  ) {
    return {
      valid: false,
      error: 'name is required and must be a non-empty string.',
    };
  }

  if (
    typeof body.sku !== 'string' ||
    !body.sku.trim()
  ) {
    return {
      valid: false,
      error: 'sku is required and must be a non-empty string.',
    };
  }

  let description: string | null = null;

  if (body.description !== undefined) {
    if (
      body.description !== null &&
      typeof body.description !== 'string'
    ) {
      return {
        valid: false,
        error: 'description must be a string or null.',
      };
    }

    description =
      typeof body.description === 'string'
        ? body.description.trim()
        : null;
  }

  let unitOfMeasure = 'each';

  if (body.unit_of_measure !== undefined) {
    if (
      typeof body.unit_of_measure !== 'string' ||
      !body.unit_of_measure.trim()
    ) {
      return {
        valid: false,
        error: 'unit_of_measure must be a non-empty string.',
      };
    }

    unitOfMeasure = body.unit_of_measure.trim();
  }

  let reorderLevel = 0;

  if (body.reorder_level !== undefined) {
    if (
      typeof body.reorder_level !== 'number' ||
      !Number.isFinite(body.reorder_level) ||
      body.reorder_level < 0
    ) {
      return {
        valid: false,
        error: 'reorder_level must be a non-negative number.',
      };
    }

    reorderLevel = body.reorder_level;
  }

  let status: 'active' | 'archived' = 'active';

  if (body.status !== undefined) {
    if (
      body.status !== 'active' &&
      body.status !== 'archived'
    ) {
      return {
        valid: false,
        error: 'status must be active or archived.',
      };
    }

    status = body.status;
  }

  return {
    valid: true,
    data: {
      category_id: body.category_id,
      name: body.name.trim(),
      sku: body.sku.trim(),
      description,
      unit_of_measure: unitOfMeasure,
      reorder_level: reorderLevel,
      status,
    },
  };
}

// POST /api/products
router.post(
  '/',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  async (req, res): Promise<void> => {
    const validation = validateProduct(req.body);

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const product = validation.data;

    try {
      const category = await dbPool.query(
        `
          SELECT 1
          FROM public.categories
          WHERE category_id = $1
          LIMIT 1
        `,
        [product.category_id],
      );

      if (category.rowCount !== 1) {
        res.status(400).json({
          error: 'The specified category does not exist.',
        });
        return;
      }

      const result = await dbPool.query<ProductRow>(
        `
          INSERT INTO public.products (
            category_id,
            name,
            sku,
            description,
            unit_of_measure,
            reorder_level,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            product_id,
            category_id,
            name,
            sku,
            description,
            unit_of_measure,
            reorder_level,
            status,
            created_at,
            updated_at
        `,
        [
          product.category_id,
          product.name,
          product.sku,
          product.description,
          product.unit_of_measure,
          product.reorder_level,
          product.status,
        ],
      );

      res.status(201).json({
        product: result.rows[0],
      });
    } catch (error) {
      const dbError = error as DatabaseError;

      if (dbError.code === '23505') {
        res.status(409).json({
          error: 'A product with this SKU already exists.',
        });
        return;
      }

      if (dbError.code === '23503') {
        res.status(400).json({
          error: 'The specified category does not exist.',
        });
        return;
      }

      if (
        ['22P02', '22003', '23514', '23502'].includes(
          dbError.code ?? '',
        )
      ) {
        res.status(400).json({
          error: 'Invalid product data.',
        });
        return;
      }

      console.error('Create product failed:', error);

      res.status(500).json({
        error: 'Unable to create product.',
      });
    }
  },
);

// Fields that can be changed through PATCH.
const EDITABLE_FIELDS = [
  'category_id',
  'name',
  'sku',
  'description',
  'unit_of_measure',
  'reorder_level',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
type ProductPatch = Partial<Pick<ProductInput, EditableField>>;

const CAN_EDIT_ARCHIVED = true;

function validateProductPatch(
  body: unknown,
):
  | { valid: true; data: ProductPatch }
  | { valid: false; error: string } {
  if (!isObject(body)) {
    return {
      valid: false,
      error: 'Request body must be a JSON object.',
    };
  }

  if ('status' in body) {
    return {
      valid: false,
      error: 'status cannot be changed here. Use the archive endpoint.',
    };
  }

  const unknownFields = Object.keys(body).filter(
    (field) =>
      !(EDITABLE_FIELDS as readonly string[]).includes(field),
  );

  if (unknownFields.length > 0) {
    return {
      valid: false,
      error: `Unknown or read-only field(s): ${unknownFields.join(', ')}.`,
    };
  }

  if (Object.keys(body).length === 0) {
    return {
      valid: false,
      error: 'Provide at least one field to update.',
    };
  }

  const data: ProductPatch = {};

  if (body.category_id !== undefined) {
    if (
      typeof body.category_id !== 'string' ||
      !UUID_PATTERN.test(body.category_id)
    ) {
      return {
        valid: false,
        error: 'category_id must be a valid UUID.',
      };
    }

    data.category_id = body.category_id;
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return {
        valid: false,
        error: 'name must be a non-empty string.',
      };
    }

    data.name = body.name.trim();
  }

  if (body.sku !== undefined) {
    if (typeof body.sku !== 'string' || !body.sku.trim()) {
      return {
        valid: false,
        error: 'sku must be a non-empty string.',
      };
    }

    data.sku = body.sku.trim();
  }

  if (body.description !== undefined) {
    if (
      body.description !== null &&
      typeof body.description !== 'string'
    ) {
      return {
        valid: false,
        error: 'description must be a string or null.',
      };
    }

    data.description =
      typeof body.description === 'string'
        ? body.description.trim()
        : null;
  }

  if (body.unit_of_measure !== undefined) {
    if (
      typeof body.unit_of_measure !== 'string' ||
      !body.unit_of_measure.trim()
    ) {
      return {
        valid: false,
        error: 'unit_of_measure must be a non-empty string.',
      };
    }

    data.unit_of_measure = body.unit_of_measure.trim();
  }

  if (body.reorder_level !== undefined) {
    if (
      typeof body.reorder_level !== 'number' ||
      !Number.isFinite(body.reorder_level) ||
      body.reorder_level < 0
    ) {
      return {
        valid: false,
        error: 'reorder_level must be a non-negative number.',
      };
    }

    data.reorder_level = body.reorder_level;
  }

  return { valid: true, data };
}

// PATCH /api/products/:id
router.patch(
  '/:id',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  async (req, res): Promise<void> => {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';

    if (!UUID_PATTERN.test(id)) {
      res.status(400).json({
        error: 'Product id must be a valid UUID.',
      });
      return;
    }

    const validation = validateProductPatch(req.body);

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const changes = validation.data;
    const columns = Object.keys(changes) as EditableField[];

    try {
      if (changes.category_id !== undefined) {
        const category = await dbPool.query(
          `
            SELECT 1
            FROM public.categories
            WHERE category_id = $1
            LIMIT 1
          `,
          [changes.category_id],
        );

        if (category.rowCount !== 1) {
          res.status(400).json({
            error: 'The specified category does not exist.',
          });
          return;
        }
      }

      // Prevent SKU changes after stock movement history exists.
      if (changes.sku !== undefined) {
        const movementHistory = await dbPool.query(
          `
            SELECT 1
            FROM public.stock_movements
            WHERE product_id = $1
            LIMIT 1
          `,
          [id],
        );

        if (
          movementHistory.rowCount !== null &&
          movementHistory.rowCount > 0
        ) {
          res.status(409).json({
            error:
              'SKU cannot be changed because this product has stock movement history.',
          });
          return;
        }
      }

      const assignments = columns.map(
        (column, index) => `${column} = $${index + 1}`,
      );

      const values = columns.map((column) => changes[column]);

      const archivedGuard = CAN_EDIT_ARCHIVED
        ? ''
        : "AND status <> 'archived'";

      const result = await dbPool.query<ProductRow>(
        `
          UPDATE public.products
          SET ${assignments.join(', ')}, updated_at = now()
          WHERE product_id = $${columns.length + 1}
          ${archivedGuard}
          RETURNING
            product_id,
            category_id,
            name,
            sku,
            description,
            unit_of_measure,
            reorder_level,
            status,
            created_at,
            updated_at
        `,
        [...values, id],
      );

      if (result.rowCount === 1) {
        res.status(200).json({
          product: result.rows[0],
        });
        return;
      }

      const existing = await dbPool.query(
        `
          SELECT 1
          FROM public.products
          WHERE product_id = $1
          LIMIT 1
        `,
        [id],
      );

      if (existing.rowCount !== 1) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }

      res.status(409).json({
        error: 'Archived products cannot be edited.',
      });
    } catch (error) {
      const dbError = error as DatabaseError;

      if (dbError.code === '23505') {
        res.status(409).json({
          error: 'A product with this SKU already exists.',
        });
        return;
      }

      if (dbError.code === '23503') {
        res.status(400).json({
          error: 'The specified category does not exist.',
        });
        return;
      }

      if (
        ['22P02', '22003', '23514', '23502'].includes(
          dbError.code ?? '',
        )
      ) {
        res.status(400).json({
          error: 'Invalid product data.',
        });
        return;
      }

      console.error('Edit product failed:', error);

      res.status(500).json({
        error: 'Unable to update product.',
      });
    }
  },
);

// PATCH /api/products/:id/archive
// Manager only. Products with remaining stock cannot be archived.
router.patch(
  '/:id/archive',
  requireSession,
  customRequireRole('Manager'),
  async (req, res): Promise<void> => {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';

    if (!UUID_PATTERN.test(id)) {
      res.status(400).json({
        error: 'Product id must be a valid UUID.',
      });
      return;
    }

    try {
      const productResult = await dbPool.query<
        Pick<ProductRow, 'product_id' | 'status'>
      >(
        `
          SELECT product_id, status
          FROM public.products
          WHERE product_id = $1
          LIMIT 1
        `,
        [id],
      );

      const product = productResult.rows[0];

      if (!product) {
        res.status(404).json({
          error: 'Product not found.',
        });
        return;
      }

      if (product.status === 'archived') {
        res.status(200).json({
          message: 'Product is already archived.',
          product,
        });
        return;
      }

      const inventoryResult = await dbPool.query<{
        has_stock: boolean;
      }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM public.inventory
            WHERE product_id = $1
              AND quantity > 0
          ) AS has_stock
        `,
        [id],
      );

      if (inventoryResult.rows[0]?.has_stock) {
        res.status(409).json({
          error:
            'Cannot archive a product while stock remains in inventory.',
        });
        return;
      }

      const archiveResult = await dbPool.query<ProductRow>(
        `
          UPDATE public.products
          SET status = 'archived',
              updated_at = now()
          WHERE product_id = $1
            AND status <> 'archived'
          RETURNING
            product_id,
            category_id,
            name,
            sku,
            description,
            unit_of_measure,
            reorder_level,
            status,
            created_at,
            updated_at
        `,
        [id],
      );

      if (archiveResult.rowCount === 1) {
        res.status(200).json({
          product: archiveResult.rows[0],
        });
        return;
      }

      const currentResult = await dbPool.query<
        Pick<ProductRow, 'product_id' | 'status'>
      >(
        `
          SELECT product_id, status
          FROM public.products
          WHERE product_id = $1
          LIMIT 1
        `,
        [id],
      );

      const currentProduct = currentResult.rows[0];

      if (!currentProduct) {
        res.status(404).json({
          error: 'Product not found.',
        });
        return;
      }

      if (currentProduct.status === 'archived') {
        res.status(200).json({
          message: 'Product is already archived.',
          product: currentProduct,
        });
        return;
      }

      res.status(409).json({
        error:
          'Product could not be archived because its status changed.',
      });
    } catch (error) {
      console.error('Archive product failed:', error);

      res.status(500).json({
        error: 'Unable to archive product.',
      });
    }
  },
);

// GET /api/products/:id
router.get(
  '/:id',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
  async (req, res): Promise<void> => {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';

    if (!UUID_PATTERN.test(id)) {
      res.status(400).json({
        error: 'Product id must be a valid UUID.',
      });
      return;
    }

    try {
      const result = await dbPool.query<{
        product: Record<string, unknown>;
        total_on_hand: string;
        last_received_at: string | null;
        last_count_at: string | null;
        locations: unknown[];
        recent_movements: unknown[];
      }>(
        `
          SELECT
            jsonb_build_object(
              'product_id', p.product_id,
              'category_id', p.category_id,
              'category_name', c.name,
              'name', p.name,
              'sku', p.sku,
              'description', p.description,
              'unit_of_measure', p.unit_of_measure,
              'reorder_level', p.reorder_level::text,
              'status', p.status,
              'created_at', p.created_at,
              'updated_at', p.updated_at
            ) AS product,

            COALESCE(
              (
                SELECT SUM(i.quantity)
                FROM public.inventory i
                WHERE i.product_id = p.product_id
              ),
              0
            )::text AS total_on_hand,

            (
              SELECT MAX(sm.created_at)
              FROM public.stock_movements sm
              WHERE sm.product_id = p.product_id
                AND sm.movement_type = 'RECEIPT'
            ) AS last_received_at,

            (
              SELECT MAX(sm.created_at)
              FROM public.stock_movements sm
              WHERE sm.product_id = p.product_id
                AND sm.movement_type = 'COUNT_VARIANCE'
            ) AS last_count_at,

            COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'location_id', l.location_id,
                    'location_name', l.name,
                    'location_code', l.code,
                    'quantity', COALESCE(i.quantity, 0)::text
                  )
                  ORDER BY l.name
                )
                FROM public.locations l
                LEFT JOIN public.inventory i
                  ON i.location_id = l.location_id
                  AND i.product_id = p.product_id
                WHERE l.status = 'active'
              ),
              '[]'::jsonb
            ) AS locations,

            COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'movement_id', movement_data.movement_id,
                    'movement_no', movement_data.movement_no,
                    'movement_type', movement_data.movement_type,
                    'quantity_change', movement_data.quantity_change,
                    'quantity_before', movement_data.quantity_before,
                    'quantity_after', movement_data.quantity_after,
                    'reference_no', movement_data.reference_no,
                    'reason', movement_data.reason,
                    'notes', movement_data.notes,
                    'created_at', movement_data.created_at,
                    'location_name', movement_data.location_name,
                    'user_name', movement_data.user_name
                  )
                  ORDER BY
                    movement_data.created_at DESC,
                    movement_data.movement_id DESC
                )
                FROM (
                  SELECT
                    sm.movement_id,
                    sm.movement_no,
                    sm.movement_type,
                    sm.quantity_change::text AS quantity_change,
                    sm.quantity_before::text AS quantity_before,
                    sm.quantity_after::text AS quantity_after,
                    sm.reference_no,
                    COALESCE(rc.label, sm.reason) AS reason,
                    sm.notes,
                    sm.created_at,
                    l.name AS location_name,
                    COALESCE(
                      NULLIF(
                        TRIM(CONCAT(u.first_name, ' ', u.last_name)),
                        ''
                      ),
                      u.email
                    ) AS user_name
                  FROM public.stock_movements sm
                  LEFT JOIN public.locations l
                    ON l.location_id = sm.location_id
                  LEFT JOIN public.users u
                    ON u.user_id = sm.user_id
                  LEFT JOIN public.reason_codes rc
                    ON rc.reason_code_id = sm.reason_code_id
                  WHERE sm.product_id = p.product_id
                  ORDER BY
                    sm.created_at DESC,
                    sm.movement_id DESC
                  LIMIT 10
                ) AS movement_data
              ),
              '[]'::jsonb
            ) AS recent_movements

          FROM public.products p
          LEFT JOIN public.categories c
            ON c.category_id = p.category_id
          WHERE p.product_id = $1
          LIMIT 1
        `,
        [id],
      );

      const row = result.rows[0];

      if (!row) {
        res.status(404).json({
          error: 'Product not found.',
        });
        return;
      }

      res.status(200).json({
        product: row.product,
        summary: {
          total_on_hand: row.total_on_hand,
          last_received_at: row.last_received_at,
          last_count_at: row.last_count_at,
        },
        locations: row.locations,
        recent_movements: row.recent_movements,
      });
    } catch (error) {
      console.error('Get product details failed:', error);

      res.status(500).json({
        error: 'Unable to retrieve product details.',
      });
    }
  },
);

// GET /api/products
router.get(
  '/',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
  async (req, res): Promise<void> => {
    const allowedQueryFields = new Set([
      'search',
      'category_id',
      'status',
      'includeArchived',
      'page',
      'pageSize',
    ]);

    for (const [key, value] of Object.entries(req.query)) {
      if (!allowedQueryFields.has(key)) {
        res.status(400).json({
          error: `Unknown query parameter: ${key}.`,
        });
        return;
      }

      if (typeof value !== 'string') {
        res.status(400).json({
          error: `${key} must have a single string value.`,
        });
        return;
      }
    }

    const query = req.query as Record<string, string>;

    const pageText = query.page ?? '1';
    const pageSizeText = query.pageSize ?? '20';

    if (
      !/^[1-9]\d*$/.test(pageText) ||
      !/^[1-9]\d*$/.test(pageSizeText)
    ) {
      res.status(400).json({
        error: 'page and pageSize must be positive integers.',
      });
      return;
    }

    const page = Number(pageText);
    const pageSize = Number(pageSizeText);

    if (
      !Number.isSafeInteger(page) ||
      !Number.isSafeInteger(pageSize) ||
      pageSize > 100
    ) {
      res.status(400).json({
        error: 'Invalid pagination. pageSize must not exceed 100.',
      });
      return;
    }

    const offset = (page - 1) * pageSize;

    if (!Number.isSafeInteger(offset)) {
      res.status(400).json({
        error: 'Pagination offset is too large.',
      });
      return;
    }

    let search: string | null = null;

    if (query.search !== undefined) {
      search = query.search.trim();

      if (search.length > 200) {
        res.status(400).json({
          error: 'search must not exceed 200 characters.',
        });
        return;
      }

      if (!search) {
        search = null;
      }
    }

    let categoryId: string | null = null;

    if (query.category_id !== undefined) {
      categoryId = query.category_id.trim();

      if (!UUID_PATTERN.test(categoryId)) {
        res.status(400).json({
          error: 'category_id must be a valid UUID.',
        });
        return;
      }
    }

    const status = query.status;

    if (
      status !== undefined &&
      status !== 'active' &&
      status !== 'archived'
    ) {
      res.status(400).json({
        error: 'status must be active or archived.',
      });
      return;
    }

    const archivedText = query.includeArchived ?? 'false';

    if (
      archivedText !== 'true' &&
      archivedText !== 'false'
    ) {
      res.status(400).json({
        error: 'includeArchived must be true or false.',
      });
      return;
    }

    const includeArchived = archivedText === 'true';

    const showArchived =
      includeArchived || status === 'archived';

    const conditions: string[] = [];
    const values: unknown[] = [];

    function addCondition(
      expression: string,
      value: unknown,
    ): void {
      values.push(value);

      conditions.push(
        expression.replace('$VALUE', `$${values.length}`),
      );
    }

    if (search !== null) {
      values.push(search);

      const searchParameter = `$${values.length}`;

      conditions.push(`
        (
          STRPOS(LOWER(p.name), LOWER(${searchParameter})) > 0
          OR
          STRPOS(LOWER(p.sku), LOWER(${searchParameter})) > 0
        )
      `);
    }

    if (categoryId !== null) {
      addCondition('p.category_id = $VALUE', categoryId);
    }

    if (status !== undefined) {
      addCondition('p.status = $VALUE', status);
    } else if (!showArchived) {
      conditions.push("p.status = 'active'");
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    try {
      const result = await dbPool.query<{
        total: string;
        items: ProductRow[];
      }>(
        `
          WITH filtered AS (
            SELECT
              p.product_id,
              p.category_id,
              p.name,
              p.sku,
              p.description,
              p.unit_of_measure,
              p.reorder_level,
              p.status,
              p.created_at,
              p.updated_at
            FROM public.products AS p
            ${whereClause}
          ),
          total_count AS (
            SELECT COUNT(*)::text AS total
            FROM filtered
          ),
          page_items AS (
            SELECT *
            FROM filtered
            ORDER BY created_at DESC, product_id DESC
            LIMIT $${values.length + 1}
            OFFSET $${values.length + 2}
          )
          SELECT
            total_count.total,
            COALESCE(
              (
                SELECT jsonb_agg(
                  to_jsonb(page_items)
                  ORDER BY
                    page_items.created_at DESC,
                    page_items.product_id DESC
                )
                FROM page_items
              ),
              '[]'::jsonb
            ) AS items
          FROM total_count
        `,
        [...values, pageSize, offset],
      );

      const row = result.rows[0];

      res.status(200).json({
        items: row?.items ?? [],
        total: Number(row?.total ?? '0'),
        page,
        pageSize,
      });
    } catch (error) {
      console.error('List products failed:', error);

      res.status(500).json({
        error: 'Unable to retrieve products.',
      });
    }
  },
);

export default router;
