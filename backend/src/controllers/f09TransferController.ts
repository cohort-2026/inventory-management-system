
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ApiError = Error & {
  statusCode?: 400 | 403 | 404 | 409;
};

type DispatchLineInput = {
  product_id: string;
  quantity: string;
};

type DispatchInput = {
  from_location_id: string;
  to_location_id: string;
  note: string | null;
  lines: DispatchLineInput[];
};

type ReceiveLineInput = {
  product_id: string;
  quantity_received: string;
  shortage_reason_code_id: string | null;
  shortage_note: string | null;
};

type ReceiveInput = {
  lines: ReceiveLineInput[];
};

type RejectTransferInput = {
  rejection_reason: string;
  rejection_note: string;
};

function apiError(
  statusCode: 400 | 403 | 404 | 409,
  message: string,
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  return error;
}

function sendKnownError(res: Response, error: unknown): boolean {
  if (
    error instanceof StockRuleError
  ) {
    res.status(400).json({ error: error.message });
    return true;
  }

  if (error instanceof TransactionConcurrencyError) {
    res.status(409).json({
      error: 'The stock changed during this operation. Please try again.',
    });
    return true;
  }

  if (
    error !== null &&
    typeof error === 'object' &&
    'statusCode' in error
  ) {
    const statusCode = (error as ApiError).statusCode;

    if (
      statusCode === 400 ||
      statusCode === 403 ||
      statusCode === 404 ||
      statusCode === 409
    ) {
      res.status(statusCode).json({
        error:
        error instanceof Error
        ? error.message
        : 'The request could not be completed.',
      });
    }
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
    'from_location_id',
    'to_location_id',
    'note',
    'lines',
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

  if (
    typeof data.from_location_id !== 'string' ||
    !UUID_REGEX.test(data.from_location_id)
  ) {
    throw apiError(400, 'A valid source location is required.');
  }

  if (
    typeof data.to_location_id !== 'string' ||
    !UUID_REGEX.test(data.to_location_id)
  ) {
    throw apiError(400, 'A valid destination location is required.');
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
    typeof data.note !== 'string'
  ) {
    throw apiError(400, 'Transfer note must be text.');
  }

  if (
    typeof data.note === 'string' &&
    data.note.trim().length > 2000
  ) {
    throw apiError(400, 'Transfer note cannot exceed 2000 characters.');
  }

  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    throw apiError(400, 'At least one transfer line is required.');
  }

  const seenProducts = new Set<string>();

  const lines = data.lines.map((value): DispatchLineInput => {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw apiError(400, 'Each transfer line must be an object.');
    }

    const line = value as Record<string, unknown>;

    const allowedLineFields = new Set([
      'product_id',
      'quantity',
    ]);

    const unknownLineFields = Object.keys(line).filter(
      (field) => !allowedLineFields.has(field),
    );

    if (unknownLineFields.length > 0) {
      throw apiError(
        400,
        `Unknown transfer line field(s): ${unknownLineFields.join(', ')}.`,
      );
    }

    if (
      typeof line.product_id !== 'string' ||
      !UUID_REGEX.test(line.product_id)
    ) {
      throw apiError(400, 'Each transfer line needs a valid product ID.');
    }

    if (seenProducts.has(line.product_id)) {
      throw apiError(400, 'A product can only appear once in a transfer.');
    }

    seenProducts.add(line.product_id);

    let quantity: string;

    try {
      quantity = parsePositiveStockQuantity(line.quantity);
    } catch {
      throw apiError(400, 'Each transfer line needs a valid positive quantity.');
    }

    return {
      product_id: line.product_id,
      quantity,
    };
  });

  return {
    from_location_id: data.from_location_id,
    to_location_id: data.to_location_id,
    note:
      typeof data.note === 'string' && data.note.trim()
        ? data.note.trim()
        : null,
    lines,
  };
}

function parseReceiveLines(body: unknown): ReceiveInput {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw apiError(400, 'Body must be a JSON object.');
  }

  const data = body as Record<string, unknown>;

  const allowedFields = new Set(['lines']);

  const unknownFields = Object.keys(data).filter(
    (field) => !allowedFields.has(field),
  );

  if (unknownFields.length > 0) {
    throw apiError(
      400,
      `Unknown field(s): ${unknownFields.join(', ')}.`,
    );
  }

  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    throw apiError(400, 'At least one received transfer line is required.');
  }

  const seenProducts = new Set<string>();

  const lines = data.lines.map((value): ReceiveLineInput => {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw apiError(400, 'Each received transfer line must be an object.');
    }

    const line = value as Record<string, unknown>;

    const allowedLineFields = new Set([
      'product_id',
      'quantity_received',
      'shortage_reason_code_id',
      'shortage_note',
    ]);

    const unknownLineFields = Object.keys(line).filter(
      (field) => !allowedLineFields.has(field),
    );

    if (unknownLineFields.length > 0) {
      throw apiError(
        400,
        `Unknown received transfer line field(s): ${unknownLineFields.join(', ')}.`,
      );
    }

    if (
      typeof line.product_id !== 'string' ||
      !UUID_REGEX.test(line.product_id)
    ) {
      throw apiError(400, 'Each received line needs a valid product ID.');
    }

    if (seenProducts.has(line.product_id)) {
      throw apiError(400, 'A product can only appear once in a receipt.');
    }

    seenProducts.add(line.product_id);

    let quantityReceived: string;

    try {
      quantityReceived =
        line.quantity_received === 0 ||
        line.quantity_received === '0'
          ? '0'
          : parsePositiveStockQuantity(line.quantity_received);
    } catch {
      throw apiError(
        400,
        'Each received line needs a valid non-negative quantity.',
      );
    }

    const reasonCodeId = line.shortage_reason_code_id;
    const shortageNote = line.shortage_note;

    if (
      reasonCodeId !== undefined &&
      reasonCodeId !== null &&
      (
        typeof reasonCodeId !== 'string' ||
        !UUID_REGEX.test(reasonCodeId)
      )
    ) {
      throw apiError(400, 'Invalid shortage reason code.');
    }

    if (
      shortageNote !== undefined &&
      shortageNote !== null &&
      typeof shortageNote !== 'string'
    ) {
      throw apiError(400, 'Shortage explanation must be text.');
    }

    if (
      typeof shortageNote === 'string' &&
      shortageNote.trim().length > 2000
    ) {
      throw apiError(
        400,
        'Shortage explanation cannot exceed 2000 characters.',
      );
    }

    return {
      product_id: line.product_id,
      quantity_received: quantityReceived,
      shortage_reason_code_id:
        typeof reasonCodeId === 'string' ? reasonCodeId : null,
      shortage_note:
        typeof shortageNote === 'string' && shortageNote.trim()
          ? shortageNote.trim()
          : null,
    };
  });

  return { lines };
}

function parseRejectInput(body: unknown): RejectTransferInput {
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw apiError(400, 'Body must be a JSON object.');
  }

  const data = body as Record<string, unknown>;

  const allowedFields = new Set([
    'rejection_reason',
    'rejection_note',
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

  if (
    typeof data.rejection_reason !== 'string' ||
    !data.rejection_reason.trim() ||
    data.rejection_reason.trim().length > 500
  ) {
    throw apiError(
      400,
      'A rejection reason is required (maximum 500 characters).',
    );
  }

  if (
    typeof data.rejection_note !== 'string' ||
    !data.rejection_note.trim() ||
    data.rejection_note.trim().length > 2000
  ) {
    throw apiError(
      400,
      'A rejection explanation is required (maximum 2000 characters).',
    );
  }

  return {
    rejection_reason: data.rejection_reason.trim(),
    rejection_note: data.rejection_note.trim(),
  };
}

async function getTransitLocation(
  client: PoolClient,
): Promise<string> {
  const result = await client.query<{ location_id: string }>(
    `
      SELECT location_id
      FROM public.locations
      WHERE code = 'SYS-TRANSIT'
        AND status = 'ACTIVE'
      LIMIT 1
    `,
  );

  const location = result.rows[0];

  if (!location) {
    throw new Error('The system transit location is not configured.');
  }

  return location.location_id;
}

async function prepareInventoryRows(
  client: PoolClient,
  productId: string,
  locationIds: string[],
): Promise<void> {
  const sortedLocationIds = [...new Set(locationIds)].sort();

  for (const locationId of sortedLocationIds) {
    await client.query(
      `
        INSERT INTO public.inventory (
          product_id,
          location_id,
          quantity,
          updated_at
        )
        VALUES ($1, $2, 0, NOW())
        ON CONFLICT (product_id, location_id) DO NOTHING
      `,
      [productId, locationId],
    );
  }

  await client.query(
    `
      SELECT inventory_id
      FROM public.inventory
      WHERE product_id = $1
        AND location_id = ANY($2::uuid[])
      ORDER BY location_id
      FOR UPDATE
    `,
    [productId, sortedLocationIds],
  );
}

async function addStockAtLocation(
  client: PoolClient,
  productId: string,
  locationId: string,
  quantity: string,
): Promise<{ quantity_before: string; quantity_after: string }> {
  const result = await client.query<{
    quantity_before: string;
    quantity_after: string;
  }>(
    `
      UPDATE public.inventory
      SET
        quantity = quantity + $3::numeric,
        updated_at = NOW()
      WHERE product_id = $1
        AND location_id = $2
      RETURNING
        (quantity - $3::numeric)::text AS quantity_before,
        quantity::text AS quantity_after
    `,
    [productId, locationId, quantity],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error('Unable to update inventory at the requested location.');
  }

  return row;
}

async function getProductUnit(
  client: PoolClient,
  productId: string,
): Promise<string> {
  const result = await client.query<{ unit_of_measure: string }>(
    `
      SELECT unit_of_measure
      FROM public.products
      WHERE product_id = $1
    `,
    [productId],
  );

  return result.rows[0]?.unit_of_measure ?? 'each';
}

async function insertTransferMovements(
  client: PoolClient,
  input: {
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
  const unitOfMeasure = await getProductUnit(client, input.productId);

  await client.query(
    `
      INSERT INTO public.stock_movements (
        product_id,
        location_id,
        movement_type,
        quantity,
        quantity_before,
        quantity_after,
        unit_of_measure,
        reference_id,
        reference_no,
        notes,
        created_by
      )
      VALUES
        (
          $1, $2, 'TRANSFER_OUT', $3::numeric,
          $4::numeric, $5::numeric, $6,
          $7, $8, $9, $10
        ),
        (
          $1, $11, 'TRANSFER_IN', $3::numeric,
          $12::numeric, $13::numeric, $6,
          $7, $8, $9, $10
        )
    `,
    [
      input.productId,
      input.outLocationId,
      input.quantity,
      input.outBefore,
      input.outAfter,
      unitOfMeasure,
      input.referenceId,
      input.referenceNo,
      input.notes
        ? `${input.reason}\n${input.notes}`
        : input.reason,
      input.userId,
      input.inLocationId,
      input.inBefore,
      input.inAfter,
    ],
  );
}

// GET /api/inventory/transfers/pending
export async function getPendingF09Transfers(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  const user = req.authenticatedUser;

  if (!user?.id) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  try {
    const values: unknown[] = [];
    let locationFilter = '';

    if (req.resolvedRole === 'Inventory Staff') {
      if (!user.homeLocationId) {
        res.status(403).json({
          error: 'Your account has no assigned inventory location.',
        });
        return;
      }

      values.push(user.homeLocationId);
      locationFilter = 'AND t.to_location_id = $1';
    }

    const result = await (await import('../db/pool')).dbPool.query(
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
          COUNT(tl.product_id)::int AS line_count
        FROM public.transfers t
        JOIN public.locations source
          ON source.location_id = t.from_location_id
        JOIN public.locations destination
          ON destination.location_id = t.to_location_id
        LEFT JOIN public.transfer_lines tl
          ON tl.transfer_id = t.transfer_id
        WHERE t.status = 'IN_TRANSIT'
          ${locationFilter}
        GROUP BY
          t.transfer_id,
          source.name,
          destination.name
        ORDER BY t.dispatched_at DESC NULLS LAST, t.created_at DESC
      `,
      values,
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Unable to load pending transfers:', error);
    res.status(500).json({
      error: 'Unable to load pending transfers.',
    });
  }
}

// GET /api/inventory/transfers/:transferId
export async function getF09TransferDetails(
  req: RoleAuthenticatedRequest,
  res: Response,
): Promise<void> {
  const user = req.authenticatedUser;

  if (!user?.id) {
    res.status(401).json({ error: 'Authentication required.' });
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
    const { dbPool } = await import('../db/pool');

    const result = await dbPool.query(
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
          t.rejected_by,
          t.rejected_at,
          t.rejection_reason,
          t.rejection_note,
          t.from_location_id,
          t.to_location_id,
          source.name AS from_location_name,
          source.code AS from_location_code,
          destination.name AS to_location_name,
          destination.code AS to_location_code,
          COALESCE(
            json_agg(
              json_build_object(
                'product_id', tl.product_id,
                'product_name', p.name,
                'product_sku', p.sku,
                'quantity_sent', tl.quantity_sent,
                'quantity_received', tl.quantity_received,
                'shortage_reason_code_id', tl.shortage_reason_code_id,
                'shortage_note', tl.shortage_note
              )
              ORDER BY p.name
            ) FILTER (WHERE tl.product_id IS NOT NULL),
            '[]'::json
          ) AS lines
        FROM public.transfers t
        JOIN public.locations source
          ON source.location_id = t.from_location_id
        JOIN public.locations destination
          ON destination.location_id = t.to_location_id
        LEFT JOIN public.transfer_lines tl
          ON tl.transfer_id = t.transfer_id
        LEFT JOIN public.products p
          ON p.product_id = tl.product_id
        WHERE t.transfer_id = $1
        GROUP BY
          t.transfer_id,
          source.name,
          source.code,
          destination.name,
          destination.code
      `,
      [transferId],
    );

    const transfer = result.rows[0];

    if (!transfer) {
      res.status(404).json({ error: 'Transfer not found.' });
      return;
    }

    if (
      req.resolvedRole === 'Inventory Staff' &&
      user.homeLocationId !== transfer.to_location_id &&
      user.homeLocationId !== transfer.from_location_id
    ) {
      res.status(403).json({
        error: 'You are not permitted to view this transfer.',
      });
      return;
    }

    res.status(200).json(transfer);
  } catch (error) {
    console.error('Unable to load transfer details:', error);
    res.status(500).json({
      error: 'Unable to load transfer details.',
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
      const locationResult = await client.query(
        `
          SELECT location_id
          FROM public.locations
          WHERE location_id = ANY($1::uuid[])
            AND status = 'ACTIVE'
          FOR UPDATE
        `,
        [[input.from_location_id, input.to_location_id]],
      );

      if (locationResult.rows.length !== 2) {
        throw apiError(
          400,
          'Both transfer locations must be active.',
        );
      }

      const transitLocationId = await getTransitLocation(client);

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
            created_by
          )
          VALUES ($1, $2, 'DRAFT', $3, $4)
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
        throw new Error('Unable to create transfer.');
      }

      for (const line of input.lines) {
        await assertActiveStockProduct(client, line.product_id);

        await prepareInventoryRows(
          client,
          line.product_id,
          [input.from_location_id, transitLocationId],
        );

        const source = await removeStockAtLocation(
          client,
          line.product_id,
          input.from_location_id,
          line.quantity,
        );

        const transit = await addStockAtLocation(
          client,
          line.product_id,
          transitLocationId,
          line.quantity,
        );

        await client.query(
          `
            INSERT INTO public.transfer_lines (
              transfer_id,
              product_id,
              quantity_sent
            )
            VALUES ($1, $2, $3::numeric)
          `,
          [transfer.transfer_id, line.product_id, line.quantity],
        );

        await insertTransferMovements(client, {
          productId: line.product_id,
          userId: user.id,
          referenceId: transfer.transfer_id,
          referenceNo: transfer.transfer_no,
          quantity: line.quantity,
          outLocationId: input.from_location_id,
          outBefore: source.quantity_before,
          outAfter: source.quantity_after,
          inLocationId: transitLocationId,
          inBefore: transit.quantity_before,
          inAfter: transit.quantity_after,
          reason: 'Stock transfer dispatched',
          notes: input.note,
        });
      }

      await client.query(
        `
          UPDATE public.transfers
          SET
            status = 'IN_TRANSIT',
            dispatched_at = NOW(),
            updated_at = NOW()
          WHERE transfer_id = $1
        `,
        [transfer.transfer_id],
      );

      return {
        transfer_id: transfer.transfer_id,
        transfer_no: transfer.transfer_no,
        status: 'IN_TRANSIT',
      };
    });

    res.status(201).json(result);
  } catch (error) {
    if (sendKnownError(res, error)) return;

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

  let input: ReceiveInput;

  try {
    input = parseReceiveLines(req.body);
  } catch (error) {
    if (sendKnownError(res, error)) return;

    res.status(400).json({ error: 'Invalid receipt details.' });
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

      const lineResult = await client.query<{
        product_id: string;
        quantity_sent: string;
      }>(
        `
          SELECT
            product_id,
            quantity_sent::text AS quantity_sent
          FROM public.transfer_lines
          WHERE transfer_id = $1
          ORDER BY product_id
          FOR UPDATE
        `,
        [transferId],
      );

      if (lineResult.rows.length !== input.lines.length) {
        throw apiError(
          400,
          'The receipt must include every product in the transfer.',
        );
      }

      const sentByProduct = new Map(
        lineResult.rows.map((line) => [
          line.product_id,
          line.quantity_sent,
        ]),
      );

      const transitLocationId = await getTransitLocation(client);

      for (const line of input.lines) {
        const quantitySent = sentByProduct.get(line.product_id);

        if (quantitySent === undefined) {
          throw apiError(
            400,
            'The receipt contains a product that is not in this transfer.',
          );
        }

        const sent = Number(quantitySent);
        const received = Number(line.quantity_received);

        if (
          !Number.isFinite(received) ||
          received < 0 ||
          received > sent
        ) {
          throw apiError(
            400,
            'Received quantity must be between zero and the quantity sent.',
          );
        }

        const shortage = sent - received;

        if (
          shortage > 0 &&
          (
            !line.shortage_reason_code_id ||
            !line.shortage_note
          )
        ) {
          throw apiError(
            400,
            'A shortage reason code and explanation are required when the received quantity is less than the quantity sent.',
          );
        }

        if (shortage > 0) {
          const reasonResult = await client.query(
            `
              SELECT reason_code_id
              FROM public.reason_codes
              WHERE reason_code_id = $1
                AND movement_type = 'WRITE_OFF'
                AND is_active = TRUE
            `,
            [line.shortage_reason_code_id],
          );

          if (reasonResult.rows.length === 0) {
            throw apiError(
              400,
              'The selected shortage reason is not an active WRITE_OFF reason code.',
            );
          }
        }

        await prepareInventoryRows(
          client,
          line.product_id,
          [transitLocationId, transfer.to_location_id],
        );

        if (received > 0) {
          const transit = await removeStockAtLocation(
            client,
            line.product_id,
            transitLocationId,
            line.quantity_received,
          );

          const destination = await addStockAtLocation(
            client,
            line.product_id,
            transfer.to_location_id,
            line.quantity_received,
          );

          await insertTransferMovements(client, {
            productId: line.product_id,
            userId: user.id,
            referenceId: transfer.transfer_id,
            referenceNo: transfer.transfer_no,
            quantity: line.quantity_received,
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

        if (shortage > 0) {
          const transit = await removeStockAtLocation(
            client,
            line.product_id,
            transitLocationId,
            String(shortage),
          );

          await client.query(
            `
              INSERT INTO public.stock_movements (
                product_id,
                location_id,
                movement_type,
                quantity,
                quantity_before,
                quantity_after,
                unit_of_measure,
                reason_code_id,
                reference_id,
                reference_no,
                notes,
                created_by
              )
              VALUES (
                $1, $2, 'WRITE_OFF', $3::numeric,
                $4::numeric, $5::numeric, $6,
                $7, $8, $9, $10, $11
              )
            `,
            [
              line.product_id,
              transitLocationId,
              shortage,
              transit.quantity_before,
              transit.quantity_after,
              await getProductUnit(client, line.product_id),
              line.shortage_reason_code_id,
              transfer.transfer_id,
              transfer.transfer_no,
              line.shortage_note,
              user.id,
            ],
          );
        }

        await client.query(
          `
            UPDATE public.transfer_lines
            SET
              quantity_received = $3::numeric,
              shortage_reason_code_id = $4,
              shortage_note = $5
            WHERE transfer_id = $1
              AND product_id = $2
          `,
          [
            transfer.transfer_id,
            line.product_id,
            line.quantity_received,
            line.shortage_reason_code_id,
            line.shortage_note,
          ],
        );
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
      };
    });

    res.status(200).json(result);
  } catch (error) {
    if (sendKnownError(res, error)) return;

    console.error('F09 transfer receipt failed:', error);
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
      error: 'Only Managers can cancel stock transfers.',
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
      }>(
        `
          SELECT
            transfer_id,
            transfer_no,
            status,
            from_location_id
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
          'Only transfers currently in transit can be cancelled.',
        );
      }

      const linesResult = await client.query<{
        product_id: string;
        quantity_sent: string;
      }>(
        `
          SELECT
            product_id,
            quantity_sent::text AS quantity_sent
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
          reason: 'Stock transfer cancelled',
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

// POST /api/inventory/transfers/:transferId/reject
export async function rejectF09Transfer(
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
      error: 'You are not permitted to reject transfers.',
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

  let input: RejectTransferInput;

  try {
    input = parseRejectInput(req.body);
  } catch (error) {
    if (sendKnownError(res, error)) return;

    res.status(400).json({
      error: 'Invalid transfer rejection details.',
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
          'Only transfers currently in transit can be rejected.',
        );
      }

      if (
        req.resolvedRole === 'Inventory Staff' &&
        user.homeLocationId !== transfer.to_location_id
      ) {
        throw apiError(
          403,
          'You can only reject transfers sent to your assigned location.',
        );
      }

      const linesResult = await client.query<{
        product_id: string;
        quantity_sent: string;
      }>(
        `
          SELECT
            product_id,
            quantity_sent::text AS quantity_sent
          FROM public.transfer_lines
          WHERE transfer_id = $1
          ORDER BY product_id
          FOR UPDATE
        `,
        [transferId],
      );

      if (linesResult.rows.length === 0) {
        throw new Error('Transfer has no lines to reject.');
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
          reason: 'Stock transfer rejected',
          notes:
            `Reason: ${input.rejection_reason}\n` +
            input.rejection_note,
        });
      }

      await client.query(
        `
          UPDATE public.transfers
          SET
            status = 'REJECTED',
            rejected_by = $2,
            rejected_at = NOW(),
            rejection_reason = $3,
            rejection_note = $4,
            updated_at = NOW()
          WHERE transfer_id = $1
        `,
        [
          transfer.transfer_id,
          user.id,
          input.rejection_reason,
          input.rejection_note,
        ],
      );

      return {
        transfer_id: transfer.transfer_id,
        transfer_no: transfer.transfer_no,
        status: 'REJECTED',
        rejected_by: user.id,
        rejection_reason: input.rejection_reason,
        rejection_note: input.rejection_note,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    if (sendKnownError(res, error)) return;

    console.error('F09 transfer rejection failed:', error);
    res.status(500).json({
      error: 'Unable to reject stock transfer.',
    });
  }
}
