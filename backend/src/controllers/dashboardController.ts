
import type { Response } from 'express';
import type { RoleAuthenticatedRequest } from '../middleware/customRequireRole';
import { dbPool } from '../db/pool';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIME_ZONE = 'Africa/Johannesburg';

type DashboardSummaryRow = {
  active_lines: string;
  units_on_hand: string;
  low_stock: string;
  out_of_stock: string;
};

type MovementSummaryRow = {
  movements_today: string;
};

type CountSummaryRow = {
  pending_counts: string;
  counts_to_review: string;
};

type NeedsAttentionRow = {
  product_id: string;
  product_name: string;
  sku: string;
  location_id: string;
  location_name: string;
  quantity: string;
  reorder_level: string;
  suggested_quantity: string;
  stock_status: 'OUT' | 'LOW';
};

type RecentMovementRow = {
  movement_id: string;
  movement_no: string;
  movement_type: string;
  product_id: string;
  product_name: string;
  sku: string;
  location_id: string;
  location_name: string;
  quantity_change: string;
  quantity_before: string;
  quantity_after: string;
  user_id: string;
  user_name: string;
  created_at: Date;
};

function getLocationId(
  req: RoleAuthenticatedRequest,
): string | null | false {
  const value = req.query.location_id;

  if (value === undefined || value === '') {
    return null;
  }

  if (
    typeof value !== 'string' ||
    !UUID_PATTERN.test(value)
  ) {
    return false;
  }

  return value;
}

export async function getDashboardSummary(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  const user = req.authenticatedUser;
  const role = req.resolvedRole;

  if (!user || !role) {
    res.status(401).json({
      error: 'Authentication and role verification required.',
    });
    return;
  }

  const requestedLocationId = getLocationId(req);

  if (requestedLocationId === false) {
    res.status(400).json({
      error: 'location_id must be a valid UUID.',
    });
    return;
  }

  try {
    let locationId: string | null = requestedLocationId;

    // Inventory Staff must always use their assigned home location.
    if (role === 'Inventory Staff') {
      const homeLocationId = user.homeLocationId;

      if (!homeLocationId) {
        res.status(403).json({
          error: 'No home warehouse is assigned to this account.',
        });
        return;
      }

      if (
        requestedLocationId &&
        requestedLocationId !== homeLocationId
      ) {
        res.status(403).json({
          error: 'You can only access your assigned home warehouse.',
        });
        return;
      }

      locationId = homeLocationId;
    }

    // Managers and Viewers can access all active warehouses,
    // or select one active warehouse.
    if (locationId) {
      const locationResult = await dbPool.query(
        `
          SELECT location_id
          FROM public.locations
          WHERE location_id = $1
            AND status = 'active'
          LIMIT 1
        `,
        [locationId],
      );

      if (locationResult.rowCount === 0) {
        res.status(404).json({
          error: 'The selected warehouse was not found or is inactive.',
        });
        return;
      }
    }

    const [
      inventoryResult,
      movementResult,
      countResult,
      attentionResult,
      recentMovementsResult,
    ] = await Promise.all([
      // Inventory summary.
      dbPool.query<DashboardSummaryRow>(
        `
          SELECT
            COUNT(*)::text AS active_lines,
            COALESCE(
              SUM(COALESCE(i.quantity, 0)),
              0
            )::text AS units_on_hand,
            COUNT(*) FILTER (
              WHERE COALESCE(i.quantity, 0) > 0
                AND COALESCE(i.quantity, 0) < p.reorder_level
            )::text AS low_stock,
            COUNT(*) FILTER (
              WHERE COALESCE(i.quantity, 0) = 0
            )::text AS out_of_stock
          FROM public.products p
          CROSS JOIN public.locations l
          LEFT JOIN public.inventory i
            ON i.product_id = p.product_id
            AND i.location_id = l.location_id
          WHERE p.status = 'active'
            AND l.status = 'active'
            AND (
              $1::uuid IS NULL
              OR l.location_id = $1::uuid
            )
        `,
        [locationId],
      ),

      // Movements recorded today.
      dbPool.query<MovementSummaryRow>(
        `
          SELECT COUNT(*)::text AS movements_today
          FROM public.stock_movements sm
          WHERE (
            $1::uuid IS NULL
            OR sm.location_id = $1::uuid
          )
          AND sm.created_at >= (
            date_trunc(
              'day',
              NOW() AT TIME ZONE $2
            ) AT TIME ZONE $2
          )
          AND sm.created_at < (
            (
              date_trunc(
                'day',
                NOW() AT TIME ZONE $2
              ) + INTERVAL '1 day'
            ) AT TIME ZONE $2
          )
        `,
        [locationId, TIME_ZONE],
      ),

      // Pending counts and counts awaiting review.
      dbPool.query<CountSummaryRow>(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE ic.status = 'open'
            )::text AS pending_counts,

            COUNT(*) FILTER (
              WHERE ic.status = 'open'
                AND COALESCE(items.total_items, 0) > 0
                AND COALESCE(items.counted_items, 0) =
                    COALESCE(items.total_items, 0)
            )::text AS counts_to_review

          FROM public.inventory_counts ic

          LEFT JOIN LATERAL (
            SELECT
              COUNT(*) AS total_items,
              COUNT(*) FILTER (
                WHERE ici.counted_quantity IS NOT NULL
              ) AS counted_items
            FROM public.inventory_count_items ici
            WHERE ici.count_id = ic.count_id
          ) items ON TRUE

          WHERE (
            $1::uuid IS NULL
            OR ic.location_id = $1::uuid
          )
        `,
        [locationId],
      ),

      // Stock shortages, including products without inventory rows.
      dbPool.query<NeedsAttentionRow>(
        `
          SELECT
            p.product_id,
            p.name AS product_name,
            p.sku,
            l.location_id,
            l.name AS location_name,
            COALESCE(i.quantity, 0)::text AS quantity,
            p.reorder_level::text AS reorder_level,

            GREATEST(
              p.reorder_level - COALESCE(i.quantity, 0),
              0
            )::text AS suggested_quantity,

            CASE
              WHEN COALESCE(i.quantity, 0) = 0
                THEN 'OUT'
              ELSE 'LOW'
            END AS stock_status

          FROM public.products p
          CROSS JOIN public.locations l

          LEFT JOIN public.inventory i
            ON i.product_id = p.product_id
            AND i.location_id = l.location_id

          WHERE p.status = 'active'
            AND l.status = 'active'
            AND (
              $1::uuid IS NULL
              OR l.location_id = $1::uuid
            )
            AND (
              COALESCE(i.quantity, 0) = 0
              OR (
                COALESCE(i.quantity, 0) > 0
                AND COALESCE(i.quantity, 0) < p.reorder_level
              )
            )

          ORDER BY
            CASE
              WHEN COALESCE(i.quantity, 0) = 0 THEN 0
              ELSE 1
            END,
            p.name ASC,
            l.name ASC
        `,
        [locationId],
      ),

      // Latest 10 stock movements.
      dbPool.query<RecentMovementRow>(
        `
          SELECT
            sm.movement_id,
            sm.movement_no,
            sm.movement_type,
            sm.product_id,
            p.name AS product_name,
            p.sku,
            sm.location_id,
            l.name AS location_name,
            sm.quantity_change::text AS quantity_change,
            sm.quantity_before::text AS quantity_before,
            sm.quantity_after::text AS quantity_after,
            sm.user_id,
            COALESCE(
              NULLIF(
                TRIM(CONCAT_WS(' ', u.first_name, u.last_name)),
                ''
              ),
              u.email
            ) AS user_name,
            sm.created_at

          FROM public.stock_movements sm
          JOIN public.products p
            ON p.product_id = sm.product_id
          JOIN public.locations l
            ON l.location_id = sm.location_id
          JOIN public.users u
            ON u.user_id = sm.user_id

          WHERE (
            $1::uuid IS NULL
            OR sm.location_id = $1::uuid
          )

          ORDER BY
            sm.created_at DESC,
            sm.movement_id DESC

          LIMIT 10
        `,
        [locationId],
      ),
    ]);

    const inventory = inventoryResult.rows[0];
    const movements = movementResult.rows[0];
    const counts = countResult.rows[0];

    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      active_lines: Number(inventory?.active_lines ?? 0),
      units_on_hand: Number(inventory?.units_on_hand ?? 0),
      low_stock: Number(inventory?.low_stock ?? 0),
      out_of_stock: Number(inventory?.out_of_stock ?? 0),
      movements_today: Number(movements?.movements_today ?? 0),
      pending_counts: Number(counts?.pending_counts ?? 0),
      counts_to_review: Number(counts?.counts_to_review ?? 0),

      needs_attention: attentionResult.rows.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        reorder_level: Number(item.reorder_level),
        suggested_quantity: Number(item.suggested_quantity),
      })),

      recent_movements: recentMovementsResult.rows.map((item) => ({
        ...item,
        quantity_change: Number(item.quantity_change),
        quantity_before: Number(item.quantity_before),
        quantity_after: Number(item.quantity_after),
      })),

      time_zone: TIME_ZONE,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Dashboard summary failed:', error);

    res.status(500).json({
      error: 'Unable to retrieve dashboard summary.',
    });
  }
}
