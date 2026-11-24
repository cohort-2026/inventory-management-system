import type { Response } from 'express';
import type { PoolClient } from 'pg';

import type { RoleAuthenticatedRequest } from '../middleware/customRequireRole';
import {
  withTransaction,
  TransactionConcurrencyError,
} from '../db/withTransaction';
import {
  StockRuleError,
  assertActiveStockProduct,
  parsePositiveStockQuantity,
  removeStockAtLocation,
} from '../services/stockRules';

type PgError = Error & {
  code?: string;
  constraint?: string;
};

type ApiError = Error & {
  statusCode: 400 | 403 | 404 | 409;
};

type DispatchInput = {
  product_id: string;
  from_location_id: string;
  to_location_id: string;
  quantity: string;
  note: string | null;
};

type ReceiveLineInput = {
  transfer_line_id: string;
  quantity_received: string;
  shortage_reason_code_id: string | null;
  shortage_note: string | null;
};

type InventoryChange = {
  inventory_id: string;
  quantity_before: string;
  quantity_after: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRANSIT_CODE = 'SYS-TRANSIT';

function apiError(
  statusCode: ApiError['statusCode'],
  message: string,
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  return error;
}

function isApiError(error: unknown): error is ApiError {
  return (
    error instanceof Error &&
    'statusCode' in error &&
    [400, 403, 404, 409].includes(
      Number((error as ApiError).statusCode),
    )
  );
}

function sendKnownError(
  res: Response,
  error: unknown,
): boolean {
  if (error instanceof TransactionConcurrencyError) {
    res.status(503).json({ error: error.message });
    return true;
  }

  if (error instanceof StockRuleError || isApiError(error)) {
    res.status(error.statusCode).json({
      error: error.message,
    });
    return true;
  }

  return false;
}

function parseDispatchInput(body: unknown): DispatchInput {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw apiError(400, 'Body must be a JSON object.');
  }

  const data = body as Record<string, unknown>;

  const allowedFields = new Set([
    'product_id',
    'from_location_id',
    'to_location_id',
    'quantity',
    'note',
  ]);

  const unknownFields = Object.keys(data).filter(
    (field) => !allowedFields.has(field),
  );

  if (unknownFields.length > 0) {
    throw apiError(
      400,
      `Unknown field(s): ${unknownFields.join(', ')}.`,
    );
  }

  for (const field of [
    'product_id',
    'from_location_id',
    'to_location_id',
  ]) {
    if (
      typeof data[field] !== 'string' ||
      !UUID_REGEX.test(data[field] as string)
    ) {
      throw apiError(400, `${field} must be a valid UUID.`);
    }
  }

  if (data.from_location_id === data.to_location_id) {
    throw apiError(
      400,
      'Source and destination locations must be different.',
    );
  }

  if (
    data.note !== undefined &&
    data.note !== null &&
    (
      typeof data.note !== 'string' ||
      data.note.trim().length > 2000
    )
  ) {
    throw apiError(
      400,
      'note must be a string or null (maximum 2000 characters).',
    );
  }

  return {
    product_id: data.product_id as string,
    from_location_id: data.from_location_id as string,
    to_location_id: data.to_location_id as string,
    quantity: parsePositiveStockQuantity(data.quantity),
    note:
      typeof data.note === 'string'
        ? data.note.trim() || null
        : null,
  };
}

function parseReceiveLines(body: unknown): ReceiveLineInput[] {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw apiError(400, 'Body must be a JSON object.');
  }

  const data = body as Record<string, unknown>;

  if (
    !Array.isArray(data.lines) ||
    data.lines.length === 0
  ) {
    throw apiError(400, 'At least one received line is required.');
  }

  return data.lines.map((item: unknown) => {
    if (
      item === null ||
      typeof item !== 'object' ||
      Array.isArray(item)
    ) {
      throw apiError(400, 'Each received line must be an object.');
    }

    const line = item as Record<string, unknown>;

    if (
      typeof line.transfer_line_id !== 'string' ||
      !UUID_REGEX.test(line.transfer_line_id)
    ) {
      throw apiError(400, 'Invalid transfer_line_id.');
    }

    const rawQuantity = line.quantity_received;

    const quantity =
      typeof rawQuantity === 'number'
        ? String(rawQuantity)
        : rawQuantity;

    if (
      typeof quantity !== 'string' ||
      !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(quantity) ||
      quantity.length > 100
    ) {
      throw apiError(
        400,
        'quantity_received must be a non-negative decimal.',
      );
    }

    const reasonId = line.shortage_reason_code_id;
    const shortageNote = line.shortage_note;

    if (
      reasonId !== undefined &&
      reasonId !== null &&
      (
        typeof reasonId !== 'string' ||
        !UUID_REGEX.test(reasonId)
      )
    ) {
      throw apiError(400, 'Invalid shortage reason code.');
    }

    if (
      shortageNote !== undefined &&
      shortageNote !== null &&
      (
        typeof shortageNote !== 'string' ||
        shortageNote.trim().length > 2000
      )
    ) {
      throw apiError(
        400,
        'shortage_note must be a string or null (maximum 2000 characters).',
      );
    }

    return {
      transfer_line_id: line.transfer_line_id,
      quantity_received: quantity,
      shortage_reason_code_id:
        typeof reasonId === 'string' ? reasonId : null,
      shortage_note:
        typeof shortageNote === 'string'
          ? shortageNote.trim() || null
          : null,
    };
  });
}

async function getTransitLocation(
  client: PoolClient,
): Promise<string> {
  const result = await client.query<{
    location_id: string;
  }>(
    `
      SELECT location_id
      FROM public.locations
      WHERE code = $1
        AND status = 'active'
      LIMIT 1
      FOR SHARE
    `,
    [TRANSIT_CODE],
  );

  const locationId = result.rows[0]?.location_id;

  if (!locationId) {
    throw new Error(
      'The active SYS-TRANSIT location could not be found.',
    );
  }

  return locationId;
}

async function prepareInventoryRows(
  client: PoolClient,
  productId: string,
  locationIds: string[],
): Promise<void> {
  const orderedIds = [...new Set(locationIds)].sort();

  for (const locationId of orderedIds) {
    await client.query(
      `
        INSERT INTO public.inventory (
          product_id,
          location_id,
          quantity
        )
        VALUES ($1, $2, 0)
        ON CONFLICT (product_id, location_id)
        DO NOTHING
      `,
      [productId, locationId],
    );
  }

  const locked = await client.query(
    `
      SELECT inventory_id
      FROM public.inventory
      WHERE product_id = $1
        AND location_id = ANY($2::uuid[])
      ORDER BY location_id
      FOR UPDATE
    `,
    [productId, orderedIds],
  );

  if (locked.rows.length !== orderedIds.length) {
    throw new Error('Could not lock all inventory rows.');
  }
}

async function addStockAtLocation(
  client: PoolClient,
  productId: string,
  locationId: string,
  quantity: string,
): Promise<InventoryChange> {
  const result = await client.query<InventoryChange>(
    `
      INSERT INTO public.inventory AS inv (
        product_id,
        location_id,
        quantity
      )
      VALUES ($1, $2, $3::numeric)
      ON CONFLICT (product_id, location_id)
      DO UPDATE
        SET quantity = inv.quantity + EXCLUDED.quantity
      RETURNING
        inventory_id,
        (quantity - $3::numeric)::text AS quantity_before,
        quantity::text AS quantity_after
    `,
    [productId, locationId, quantity],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error('Could not add stock to inventory.');
  }

  return row;
}

async function getProductUnit(
  client: PoolClient,
  productId: string,
): Promise<string> {
  const result = await client.query<{
    unit_of_measure: string | null;
  }>(
    `
      SELECT unit_of_measure
      FROM public.products
      WHERE product_id = $1
    `,
    [productId],
  );

  return String(result.rows[0]?.unit_of_measure ?? '')
    .trim()
    .toLowerCase();
}

async function insertTransferMovements(
  client: PoolClient,
  values: {
    productId: string;
    userId: string;
    referenceId: string;
    referenceNo: string;
    quantity: string;
    outLocationId: string;
    outBefore: string;
    outAfter: string;
    inLocationId: string;
    inBefore: string;
    inAfter: string;
    reason: string;
    notes: string | null;
  },
): Promise<void> {
  const result = await client.query(
    `
      INSERT INTO public.stock_movements (
        product_id,
        location_id,
        user_id,
        movement_type,
        quantity_change,
        quantity_before,
        quantity_after,
        reference_id,
        reference_no,
        reason,
        notes
      )
      VALUES
      (
        $1, $2, $3, 'TRANSFER_OUT',
        -$4::numeric, $5::numeric, $6::numeric,
        $7, $8, $9, $10
      ),
      (
        $1, $11, $3, 'TRANSFER_IN',
        $4::numeric, $12::numeric, $13::numeric,
        $7, $8, $9, $10
      )
      RETURNING movement_id
    `,
    [
      values.productId,
      values.outLocationId,
      values.userId,
      values.quantity,
      values.outBefore,
      values.outAfter,
      values.referenceId,
      values.referenceNo,
      values.reason,
      values.notes,
      values.inLocationId,
      values.inBefore,
      values.inAfter,
    ],
  );

  if (result.rows.length !== 2) {
    throw new Error('Transfer movements were not recorded correctly.');
  }
}

// GET /api/inventory/transfers/pending
// Managers can see all pending transfers.
// Inventory Staff can only see transfers sent to their assigned location.
export async function getPendingF09Transfers(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  if (
    req.resolvedRole !== 'Manager' &&
    req.resolvedRole !== 'Inventory Staff'
  ) {
    res.status(403).json({
      error: 'You are not permitted to view pending transfers.',
    });
    return;
  }

  const locationId =
    req.resolvedRole === 'Inventory Staff'
      ? req.authenticatedUser?.homeLocationId ?? null
      : null;

  if (
    req.resolvedRole === 'Inventory Staff' &&
    !locationId
  ) {
    res.status(403).json({
      error: 'Your account does not have an assigned location.',
    });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      return client.query(
        `
          SELECT
            t.transfer_id,
            t.transfer_no,
            t.status,
            t.note,
            t.created_at,
            t.dispatched_at,
            t.from_location_id,
            t.to_location_id,
            source.name AS from_location_name,
            destination.name AS to_location_name,
            COALESCE(
              json_agg(
                json_build_object(
                  'transfer_line_id', tl.transfer_line_id,
                  'product_id', tl.product_id,
                  'product_name', p.name,
                  'product_sku', p.sku,
                  'unit_of_measure', p.unit_of_measure,
                  'quantity_sent', tl.quantity_sent::text,
                  'quantity_received', tl.quantity_received::text
                )
                ORDER BY p.name
              ) FILTER (WHERE tl.transfer_line_id IS NOT NULL),
              '[]'::json
            ) AS lines
          FROM public.transfers t
          INNER JOIN public.locations source
            ON source.location_id = t.from_location_id
          INNER JOIN public.locations destination
            ON destination.location_id = t.to_location_id
          LEFT JOIN public.transfer_lines tl
            ON tl.transfer_id = t.transfer_id
          LEFT JOIN public.products p
            ON p.product_id = tl.product_id
          WHERE t.status = 'IN_TRANSIT'
            AND (
              $1::uuid IS NULL
              OR t.to_location_id = $1::uuid
            )
          GROUP BY
            t.transfer_id,
            t.transfer_no,
            t.status,
            t.note,
            t.created_at,
            t.dispatched_at,
            t.from_location_id,
            t.to_location_id,
            source.name,
            destination.name
          ORDER BY t.dispatched_at DESC NULLS LAST, t.created_at DESC
        `,
        [locationId],
      );
    });

    res.status(200).json({
      transfers: result.rows,
    });
  } catch (error) {
    console.error('F09 pending transfers lookup failed:', error);

    res.status(500).json({
      error: 'Unable to retrieve pending transfers.',
    });
  }
}

// GET /api/inventory/transfers/:transferId
// Managers can view any transfer.
// Inventory Staff can only view transfers sent to their assigned location.
export async function getF09TransferDetails(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  if (
    req.resolvedRole !== 'Manager' &&
    req.resolvedRole !== 'Inventory Staff'
  ) {
    res.status(403).json({
      error: 'You are not permitted to view transfer details.',
    });
    return;
  }

  const transferId = req.params.transferId;

  if (
    typeof transferId !== 'string' ||
    !UUID_REGEX.test(transferId)
  ) {
    res.status(400).json({ error: 'Invalid transfer ID.' });
    return;
  }

  const locationId =
    req.resolvedRole === 'Inventory Staff'
      ? req.authenticatedUser?.homeLocationId ?? null
      : null;

  if (
    req.resolvedRole === 'Inventory Staff' &&
    !locationId
  ) {
    res.status(403).json({
      error: 'Your account does not have an assigned location.',
    });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      return client.query(
        `
          SELECT
            t.transfer_id,
            t.transfer_no,
            t.status,
            t.note,
            t.created_at,
            t.updated_at,
            t.dispatched_at,
            t.received_at,
            t.cancelled_at,
            t.created_by,
            t.received_by,
            t.cancelled_by,
            t.from_location_id,
            t.to_location_id,
            source.name AS from_location_name,
            source.code AS from_location_code,
            destination.name AS to_location_name,
            destination.code AS to_location_code,
            COALESCE(
              json_agg(
                json_build_object(
                  'transfer_line_id', tl.transfer_line_id,
                  'product_id', tl.product_id,
                  'product_name', p.name,
                  'product_sku', p.sku,
                  'unit_of_measure', p.unit_of_measure,
                  'quantity_sent', tl.quantity_sent::text,
                  'quantity_received', tl.quantity_received::text,
                  'shortage_reason_code_id', tl.shortage_reason_code_id,
                  'shortage_note', tl.shortage_note
                )
                ORDER BY p.name
              ) FILTER (WHERE tl.transfer_line_id IS NOT NULL),
              '[]'::json
            ) AS lines
          FROM public.transfers t
          INNER JOIN public.locations source
            ON source.location_id = t.from_location_id
          INNER JOIN public.locations destination
            ON destination.location_id = t.to_location_id
          LEFT JOIN public.transfer_lines tl
            ON tl.transfer_id = t.transfer_id
          LEFT JOIN public.products p
            ON p.product_id = tl.product_id
          WHERE t.transfer_id = $1
            AND (
              $2::uuid IS NULL
              OR t.to_location_id = $2::uuid
            )
          GROUP BY
            t.transfer_id,
            t.transfer_no,
            t.status,
            t.note,
            t.created_at,
            t.updated_at,
            t.dispatched_at,
            t.received_at,
            t.cancelled_at,
            t.created_by,
            t.received_by,
            t.cancelled_by,
            t.from_location_id,
            t.to_location_id,
            source.name,
            source.code,
            destination.name,
            destination.code
        `,
        [transferId, locationId],
      );
    });

    const transfer = result.rows[0];

    if (!transfer) {
      res.status(404).json({ error: 'Transfer not found.' });
      return;
    }

    res.status(200).json({
      transfer,
    });
  } catch (error) {
    console.error('F09 transfer details lookup failed:', error);

    res.status(500).json({
      error: 'Unable to retrieve transfer details.',
    });
  }
}

// POST /api/inventory/transfers/dispatch
export async function dispatchF09Transfer(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  const user = req.authenticatedUser;

  if (!user?.id) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.resolvedRole !== 'Manager') {
    res.status(403).json({
      error: 'Only Managers can dispatch stock transfers.',
    });
    return;
  }

  let input: DispatchInput;

  try {
    input = parseDispatchInput(req.body);
  } catch (error) {
    if (sendKnownError(res, error)) return;

    res.status(400).json({ error: 'Invalid transfer details.' });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      await assertActiveStockProduct(client, input.product_id);

      const unit = await getProductUnit(
        client,
        input.product_id,
      );

      if (
        unit === 'each' &&
        !Number.isInteger(Number(input.quantity))
      ) {
        throw apiError(
          400,
          'Products measured in each require whole-number quantities.',
        );
      }

      const locations = await client.query<{
        location_id: string;
        status: string;
      }>(
        `
          SELECT location_id, status
          FROM public.locations
          WHERE location_id = ANY($1::uuid[])
        `,
        [[input.from_location_id, input.to_location_id]],
      );

      if (locations.rows.length !== 2) {
        throw apiError(
          404,
          'Source or destination location not found.',
        );
      }

      if (
        locations.rows.some(
          (location) =>
            location.status.toLowerCase() !== 'active',
        )
      ) {
        throw apiError(
          400,
          'Source and destination locations must be active.',
        );
      }

      const transitLocationId = await getTransitLocation(client);

      if (
        transitLocationId === input.from_location_id ||
        transitLocationId === input.to_location_id
      ) {
        throw apiError(
          400,
          'The transit location cannot be a transfer source or destination.',
        );
      }

      await prepareInventoryRows(
        client,
        input.product_id,
        [input.from_location_id, transitLocationId],
      );

      const source = await removeStockAtLocation(
        client,
        input.product_id,
        input.from_location_id,
        input.quantity,
      );

      const transit = await addStockAtLocation(
        client,
        input.product_id,
        transitLocationId,
        input.quantity,
      );

      const transferResult = await client.query<{
        transfer_id: string;
        transfer_no: string;
      }>(
        `
          INSERT INTO public.transfers (
            from_location_id,
            to_location_id,
            status,
            note,
            created_by,
            dispatched_at
          )
          VALUES ($1, $2, 'IN_TRANSIT', $3, $4, NOW())
          RETURNING transfer_id, transfer_no
        `,
        [
          input.from_location_id,
          input.to_location_id,
          input.note,
          user.id,
        ],
      );

      const transfer = transferResult.rows[0];

      if (!transfer) {
        throw new Error('Transfer record was not created.');
      }

      await client.query(
        `
          INSERT INTO public.transfer_lines (
            transfer_id,
            product_id,
            quantity_sent
          )
          VALUES ($1, $2, $3::numeric)
        `,
        [
          transfer.transfer_id,
          input.product_id,
          input.quantity,
        ],
      );

      await insertTransferMovements(client, {
        productId: input.product_id,
        userId: user.id,
        referenceId: transfer.transfer_id,
        referenceNo: transfer.transfer_no,
        quantity: input.quantity,
        outLocationId: input.from_location_id,
        outBefore: source.quantity_before,
        outAfter: source.quantity_after,
        inLocationId: transitLocationId,
        inBefore: transit.quantity_before,
        inAfter: transit.quantity_after,
        reason: 'Stock transfer dispatch',
        notes: input.note,
      });

      return {
        transfer_id: transfer.transfer_id,
        transfer_no: transfer.transfer_no,
        status: 'IN_TRANSIT',
        product_id: input.product_id,
        quantity_sent: input.quantity,
        from_location_id: input.from_location_id,
        to_location_id: input.to_location_id,
        transit_location_id: transitLocationId,
        source,
        transit,
      };
    });

    res.status(201).json(result);
  } catch (error) {
    if (sendKnownError(res, error)) return;

    const pgError = error as PgError;

    if (
      pgError.code === '23514' &&
      pgError.constraint === 'inventory_quantity_nonnegative'
    ) {
      res.status(409).json({
        error: 'Insufficient stock at the source location.',
      });
      return;
    }

    console.error('F09 transfer dispatch failed:', error);

    res.status(500).json({
      error: 'Unable to dispatch stock transfer.',
    });
  }
}

// POST /api/inventory/transfers/:transferId/receive
export async function receiveF09Transfer(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  const user = req.authenticatedUser;

  if (!user?.id) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (
    req.resolvedRole !== 'Manager' &&
    req.resolvedRole !== 'Inventory Staff'
  ) {
    res.status(403).json({
      error: 'You are not permitted to receive transfers.',
    });
    return;
  }

  const transferId = req.params.transferId;

  if (
    typeof transferId !== 'string' ||
    !UUID_REGEX.test(transferId)
  ) {
    res.status(400).json({ error: 'Invalid transfer ID.' });
    return;
  }

  let inputLines: ReceiveLineInput[];

  try {
    inputLines = parseReceiveLines(req.body);
  } catch (error) {
    if (sendKnownError(res, error)) return;

    res.status(400).json({
      error: 'Invalid receiving details.',
    });
    return;
  }

  if (
    new Set(inputLines.map((line) => line.transfer_line_id)).size !==
    inputLines.length
  ) {
    res.status(400).json({
      error: 'Duplicate transfer lines are not allowed.',
    });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      const transferResult = await client.query<{
        transfer_id: string;
        transfer_no: string;
        status: string;
        from_location_id: string;
        to_location_id: string;
      }>(
        `
          SELECT
            transfer_id,
            transfer_no,
            status,
            from_location_id,
            to_location_id
          FROM public.transfers
          WHERE transfer_id = $1
          FOR UPDATE
        `,
        [transferId],
      );

      const transfer = transferResult.rows[0];

      if (!transfer) {
        throw apiError(404, 'Transfer not found.');
      }

      if (transfer.status !== 'IN_TRANSIT') {
        throw apiError(
          409,
          'Only transfers currently in transit can be received.',
        );
      }

      if (
        req.resolvedRole === 'Inventory Staff' &&
        user.homeLocationId !== transfer.to_location_id
      ) {
        throw apiError(
          403,
          'You can only receive transfers sent to your assigned location.',
        );
      }

      const transferLinesResult = await client.query<{
        transfer_line_id: string;
        product_id: string;
        quantity_sent: string;
      }>(
        `
          SELECT
            transfer_line_id,
            product_id,
            quantity_sent::text AS quantity_sent
          FROM public.transfer_lines
          WHERE transfer_id = $1
          ORDER BY product_id, transfer_line_id
          FOR UPDATE
        `,
        [transferId],
      );

      const transferLines = transferLinesResult.rows;

      if (
        transferLines.length === 0 ||
        transferLines.length !== inputLines.length
      ) {
        throw apiError(
          400,
          'All transfer lines must be received together.',
        );
      }

      const inputById = new Map(
        inputLines.map((line) => [
          line.transfer_line_id,
          line,
        ]),
      );

      for (const line of transferLines) {
        if (!inputById.has(line.transfer_line_id)) {
          throw apiError(
            400,
            'The request must include every transfer line.',
          );
        }
      }

      const transitLocationId = await getTransitLocation(client);

      const processedLines = [];

      for (const transferLine of transferLines) {
        const input = inputById.get(
          transferLine.transfer_line_id,
        )!;

        const comparison = await client.query<{
          valid: boolean;
          has_shortfall: boolean;
          has_received: boolean;
          shortfall: string;
        }>(
          `
            SELECT
              $1::numeric <= $2::numeric AS valid,
              ($2::numeric - $1::numeric) > 0 AS has_shortfall,
              $1::numeric > 0 AS has_received,
              ($2::numeric - $1::numeric)::text AS shortfall
          `,
          [
            input.quantity_received,
            transferLine.quantity_sent,
          ],
        );

        const quantities = comparison.rows[0];

        if (!quantities?.valid) {
          throw apiError(
            400,
            'Received quantity cannot exceed quantity sent.',
          );
        }

        const hasShortfall = quantities.has_shortfall;
        const shortfall = quantities.shortfall;

        if (hasShortfall) {
          if (
            !input.shortage_reason_code_id ||
            !input.shortage_note
          ) {
            throw apiError(
              400,
              'A shortage reason and note are required when stock is missing.',
            );
          }

          const reasonResult = await client.query<{
            reason_code_id: string;
            requires_note: boolean;
          }>(
            `
              SELECT reason_code_id, requires_note
              FROM public.reason_codes
              WHERE reason_code_id = $1
                AND movement_type = 'WRITE_OFF'
                AND active = TRUE
              LIMIT 1
            `,
            [input.shortage_reason_code_id],
          );

          const reason = reasonResult.rows[0];

          if (!reason) {
            throw apiError(
              400,
              'Select a valid active write-off reason.',
            );
          }

          if (reason.requires_note && !input.shortage_note) {
            throw apiError(
              400,
              'A note is required for this shortage reason.',
            );
          }
        } else if (
          input.shortage_reason_code_id ||
          input.shortage_note
        ) {
          throw apiError(
            400,
            'Shortage details are not allowed when the full quantity is received.',
          );
        }

        await assertActiveStockProduct(
          client,
          transferLine.product_id,
        );

        const unit = await getProductUnit(
          client,
          transferLine.product_id,
        );

        if (
          unit === 'each' &&
          !Number.isInteger(Number(input.quantity_received))
        ) {
          throw apiError(
            400,
            'Products measured in each require whole-number received quantities.',
          );
        }

        await prepareInventoryRows(
          client,
          transferLine.product_id,
          [transitLocationId, transfer.to_location_id],
        );

        let transitAfterReceipt: string | null = null;
        let destinationAfterReceipt: string | null = null;

        // Move the actual received quantity from transit to destination.
        if (quantities.has_received) {
          const transit = await removeStockAtLocation(
            client,
            transferLine.product_id,
            transitLocationId,
            input.quantity_received,
          );

          const destination = await addStockAtLocation(
            client,
            transferLine.product_id,
            transfer.to_location_id,
            input.quantity_received,
          );

          transitAfterReceipt = transit.quantity_after;
          destinationAfterReceipt = destination.quantity_after;

          await insertTransferMovements(client, {
            productId: transferLine.product_id,
            userId: user.id,
            referenceId: transfer.transfer_id,
            referenceNo: transfer.transfer_no,
            quantity: input.quantity_received,
            outLocationId: transitLocationId,
            outBefore: transit.quantity_before,
            outAfter: transit.quantity_after,
            inLocationId: transfer.to_location_id,
            inBefore: destination.quantity_before,
            inAfter: destination.quantity_after,
            reason: 'Stock transfer received',
            notes: null,
          });
        }

        let transitAfterWriteOff: string | null = null;

        // Remove the missing quantity from transit as a write-off.
        if (hasShortfall) {
          const transit = await removeStockAtLocation(
            client,
            transferLine.product_id,
            transitLocationId,
            shortfall,
          );

          transitAfterWriteOff = transit.quantity_after;

          await client.query(
            `
              INSERT INTO public.stock_movements (
                product_id,
                location_id,
                user_id,
                movement_type,
                quantity_change,
                quantity_before,
                quantity_after,
                reference_id,
                reference_no,
                reason,
                notes,
                reason_code_id
              )
              VALUES (
                $1, $2, $3, 'WRITE_OFF',
                -$4::numeric, $5::numeric, $6::numeric,
                $7, $8, 'Transfer shortage',
                $9, $10
              )
            `,
            [
              transferLine.product_id,
              transitLocationId,
              user.id,
              shortfall,
              transit.quantity_before,
              transit.quantity_after,
              transfer.transfer_id,
              transfer.transfer_no,
              input.shortage_note,
              input.shortage_reason_code_id,
            ],
          );
        }

        await client.query(
          `
            UPDATE public.transfer_lines
            SET
              quantity_received = $2::numeric,
              shortage_reason_code_id = $3,
              shortage_note = $4,
              updated_at = NOW()
            WHERE transfer_line_id = $1
          `,
          [
            transferLine.transfer_line_id,
            input.quantity_received,
            input.shortage_reason_code_id,
            input.shortage_note,
          ],
        );

        processedLines.push({
          transfer_line_id: transferLine.transfer_line_id,
          product_id: transferLine.product_id,
          quantity_sent: transferLine.quantity_sent,
          quantity_received: input.quantity_received,
          shortage_quantity: shortfall,
          transit_quantity_after:
            transitAfterWriteOff ?? transitAfterReceipt,
          destination_quantity_after: destinationAfterReceipt,
        });
      }

      await client.query(
        `
          UPDATE public.transfers
          SET
            status = 'RECEIVED',
            received_by = $2,
            received_at = NOW(),
            updated_at = NOW()
          WHERE transfer_id = $1
        `,
        [transfer.transfer_id, user.id],
      );

      return {
        transfer_id: transfer.transfer_id,
        transfer_no: transfer.transfer_no,
        status: 'RECEIVED',
        received_by: user.id,
        lines: processedLines,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    if (sendKnownError(res, error)) return;

    console.error('F09 transfer receiving failed:', error);

    res.status(500).json({
      error: 'Unable to receive stock transfer.',
    });
  }
}

// POST /api/inventory/transfers/:transferId/cancel
export async function cancelF09Transfer(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  const user = req.authenticatedUser;

  if (!user?.id) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.resolvedRole !== 'Manager') {
    res.status(403).json({
      error: 'Only Managers can cancel transfers.',
    });
    return;
  }

  const transferId = req.params.transferId;

  if (
    typeof transferId !== 'string' ||
    !UUID_REGEX.test(transferId)
  ) {
    res.status(400).json({ error: 'Invalid transfer ID.' });
    return;
  }

  try {
    const result = await withTransaction(async (client) => {
      const transferResult = await client.query<{
        transfer_id: string;
        transfer_no: string;
        status: string;
        from_location_id: string;
        to_location_id: string;
      }>(
        `
          SELECT
            transfer_id,
            transfer_no,
            status,
            from_location_id,
            to_location_id
          FROM public.transfers
          WHERE transfer_id = $1
          FOR UPDATE
        `,
        [transferId],
      );

      const transfer = transferResult.rows[0];

      if (!transfer) {
        throw apiError(404, 'Transfer not found.');
      }

      if (transfer.status !== 'IN_TRANSIT') {
        throw apiError(
          409,
          'Only transfers in transit can be cancelled.',
        );
      }

      const linesResult = await client.query<{
        product_id: string;
        quantity_sent: string;
      }>(
        `
          SELECT product_id, quantity_sent::text AS quantity_sent
          FROM public.transfer_lines
          WHERE transfer_id = $1
          ORDER BY product_id
          FOR UPDATE
        `,
        [transferId],
      );

      if (linesResult.rows.length === 0) {
        throw new Error('Transfer has no lines to cancel.');
      }

      const transitLocationId = await getTransitLocation(client);

      for (const line of linesResult.rows) {
        await prepareInventoryRows(
          client,
          line.product_id,
          [transitLocationId, transfer.from_location_id],
        );

        const transit = await removeStockAtLocation(
          client,
          line.product_id,
          transitLocationId,
          line.quantity_sent,
        );

        const source = await addStockAtLocation(
          client,
          line.product_id,
          transfer.from_location_id,
          line.quantity_sent,
        );

        await insertTransferMovements(client, {
          productId: line.product_id,
          userId: user.id,
          referenceId: transfer.transfer_id,
          referenceNo: transfer.transfer_no,
          quantity: line.quantity_sent,
          outLocationId: transitLocationId,
          outBefore: transit.quantity_before,
          outAfter: transit.quantity_after,
          inLocationId: transfer.from_location_id,
          inBefore: source.quantity_before,
          inAfter: source.quantity_after,
          reason: 'Stock transfer cancellation',
          notes: null,
        });
      }

      await client.query(
        `
          UPDATE public.transfers
          SET
            status = 'CANCELLED',
            cancelled_by = $2,
            cancelled_at = NOW(),
            updated_at = NOW()
          WHERE transfer_id = $1
        `,
        [transfer.transfer_id, user.id],
      );

      return {
        transfer_id: transfer.transfer_id,
        transfer_no: transfer.transfer_no,
        status: 'CANCELLED',
        cancelled_by: user.id,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    if (sendKnownError(res, error)) return;

    console.error('F09 transfer cancellation failed:', error);

    res.status(500).json({
      error: 'Unable to cancel stock transfer.',
    });
  }
}