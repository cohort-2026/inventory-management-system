
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

export default router;
