
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
      res.status(400).json({
        error: validation.error,
      });
      return;
    }

    const product = validation.data;

    try {
      // Verify the referenced category exists.
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

      // Enforce SKU uniqueness through the database.
      // Parameterized values prevent SQL injection.
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
        if (
          dbError.constraint === 'products_sku_key'
        ) {
          res.status(409).json({
            error: 'A product with this SKU already exists.',
          });
          return;
        }

        res.status(409).json({
          error: 'A product with conflicting data already exists.',
        });
        return;
      }

      // Covers a category deleted between the
      // existence check and the INSERT.
      if (dbError.code === '23503') {
        res.status(400).json({
          error: 'The specified category does not exist.',
        });
        return;
      }

      // PostgreSQL rejected invalid input.
      if (
        dbError.code === '22P02' ||
        dbError.code === '22003' ||
        dbError.code === '23514' ||
        dbError.code === '23502'
      ) {
        res.status(400).json({
          error: 'Invalid product data.',
        });
        return;
      }

      console.error(
        'Create product failed:',
        error instanceof Error
          ? error.message
          : error,
      );

      res.status(500).json({
        error: 'Unable to create product.',
      });
    }
  },
);

// Fields PATCH may change. status is left out on purpose: archiving is #12.
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

// Set to true if archived products may still be edited (confirm with the team).
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
    // Route params can be typed as string | string[] | undefined.
    const id = typeof rawId === 'string' ? rawId : ''; 

    if (!UUID_PATTERN.test(id)) {
      res.status(400).json({
        error: 'Product id must be a valid UUID.',
      });
      return;
    }

    const validation = validateProductPatch(req.body);

    if (!validation.valid) {
      res.status(400).json({
        error: validation.error,
      });
      return;
    }

    const changes = validation.data;
    const columns = Object.keys(changes) as EditableField[];

    try {
      // Verify the new category exists, if it is being changed.
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

      // Column names come from the fixed list above, never from the request.
      // Values are parameterized, which prevents SQL injection.
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

      // Nothing was updated: the product is missing, or it is archived.
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
        res.status(404).json({
          error: 'Product not found.',
        });
        return;
      }

      res.status(409).json({
        error: 'Archived products cannot be edited.',
      });
    } catch (error) {
      const dbError = error as DatabaseError;

      if (dbError.code === '23505') {
        if (dbError.constraint === 'products_sku_key') {
          res.status(409).json({
            error: 'A product with this SKU already exists.',
          });
          return;
        }

        res.status(409).json({
          error: 'A product with conflicting data already exists.',
        });
        return;
      }

      // A category deleted between the check and the UPDATE.
      if (dbError.code === '23503') {
        res.status(400).json({
          error: 'The specified category does not exist.',
        });
        return;
      }

      if (
        dbError.code === '22P02' ||
        dbError.code === '22003' ||
        dbError.code === '23514' ||
        dbError.code === '23502'
      ) {
        res.status(400).json({
          error: 'Invalid product data.',
        });
        return;
      }

      console.error(
        'Edit product failed:',
        error instanceof Error ? error.message : error,
      );

      res.status(500).json({
        error: 'Unable to update product.',
      });
    }
  },
);

export default router;
