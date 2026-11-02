
import { Router } from 'express';

import { dbPool } from '../db/pool';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

type LocationRow = {
  location_id: string;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
};

// GET /api/locations
router.get(
  '/',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
  async (req, res): Promise<void> => {
    // Only the optional "search" parameter is supported.
    const queryKeys = Object.keys(req.query);

    if (queryKeys.some((key) => key !== 'search')) {
      res.status(400).json({
        error: 'Unknown query parameter.',
      });
      return;
    }

    const rawSearch = req.query.search;

    if (
      rawSearch !== undefined &&
      typeof rawSearch !== 'string'
    ) {
      res.status(400).json({
        error: 'search must be a single string value.',
      });
      return;
    }

    const search = rawSearch?.trim() ?? '';

    if (search.length > 200) {
      res.status(400).json({
        error: 'search must not exceed 200 characters.',
      });
      return;
    }

    try {
      const result = await dbPool.query<LocationRow>(
        `
          SELECT
            location_id,
            name,
            code,
            description,
            address,
            status,
            created_at,
            updated_at
          FROM public.locations
          WHERE
            $1::text = ''
            OR STRPOS(
              LOWER(name),
              LOWER($1::text)
            ) > 0
          ORDER BY
            name ASC,
            location_id ASC
        `,
        [search],
      );

      res.status(200).json({
        items: result.rows,
      });
    } catch (error) {
      console.error(
        'List locations failed:',
        error instanceof Error
          ? error.message
          : error,
      );

      res.status(500).json({
        error: 'Unable to retrieve locations.',
      });
    }
  },
);


// POST /api/locations
router.post(
  '/',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  async (req, res): Promise<void> => {
    const body: unknown = req.body;

    // Validate that the request body is an object.
    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      res.status(400).json({
        error: 'Request body must be a JSON object.',
      });
      return;
    }

    const data = body as Record<string, unknown>;

    // Only these properties are accepted.
    const allowedFields = [
      'code',
      'name',
      'description',
      'address',
      'status',
    ];

    const unknownFields = Object.keys(data).filter(
      (key) => !allowedFields.includes(key),
    );

    if (unknownFields.length > 0) {
      res.status(400).json({
        error: `Unknown field(s): ${unknownFields.join(', ')}.`,
      });
      return;
    }

    // Validate required fields.
    if (
      typeof data.code !== 'string' ||
      typeof data.name !== 'string'
    ) {
      res.status(400).json({
        error: 'Location code and name are required and must be strings.',
      });
      return;
    }

    const code = data.code.trim();
    const name = data.name.trim();

    if (!code || !name) {
      res.status(400).json({
        error: 'Location code and name cannot be empty.',
      });
      return;
    }

    // Validate optional text fields.
    if (
      data.description !== undefined &&
      data.description !== null &&
      typeof data.description !== 'string'
    ) {
      res.status(400).json({
        error: 'Description must be a string.',
      });
      return;
    }

    if (
      data.address !== undefined &&
      data.address !== null &&
      typeof data.address !== 'string'
    ) {
      res.status(400).json({
        error: 'Address must be a string.',
      });
      return;
    }

    const description =
      typeof data.description === 'string'
        ? data.description.trim() || null
        : null;

    const address =
      typeof data.address === 'string'
        ? data.address.trim() || null
        : null;

    // Default status to active.
    const status =
      data.status === undefined ? 'active' : data.status;

    if (status !== 'active' && status !== 'inactive') {
      res.status(400).json({
        error: 'Status must be either active or inactive.',
      });
      return;
    }

    try {
      const result = await dbPool.query<LocationRow>(
        `
          INSERT INTO public.locations (
            code,
            name,
            description,
            address,
            status
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING
            location_id,
            name,
            code,
            description,
            address,
            status,
            created_at,
            updated_at
        `,
        [
          code,
          name,
          description,
          address,
          status,
        ],
      );

      res.status(201).json({
        message: 'Location created successfully.',
        item: result.rows[0],
      });
    } catch (error: unknown) {
      // PostgreSQL unique constraint violation.
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        res.status(409).json({
          error: 'A location with this code already exists.',
        });
        return;
      }

      console.error(
        'Create location failed:',
        error instanceof Error ? error.message : error,
      );

      res.status(500).json({
        error: 'Unable to create location.',
      });
    }
  },
);


export default router;
