
import { Router } from 'express';
import {
  getInventory,
  getInventorySummary,
  exportInventoryCsv,
} from '../controllers/inventoryController';
import { createInventoryAdjustment } from '../controllers/inventoryAdjustmentController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';
import { createInventoryTransfer } from '../controllers/inventoryTransferController';
import { getInventoryLevel } from '../controllers/inventoryLevelController';
import {
  dispatchF09Transfer,
  receiveF09Transfer,
  cancelF09Transfer,
  rejectF09Transfer,
  getPendingF09Transfers,
  getF09TransferDetails,
} from '../controllers/f09TransferController';

const router = Router();

const readable = [
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
];

// Inventory routes
router.get('/', ...readable, getInventory);
router.get('/summary', ...readable, getInventorySummary);
router.get('/export.csv', ...readable, exportInventoryCsv);
router.get('/level', ...readable, getInventoryLevel);

// Existing instant stock transfer (kept unchanged)
router.post(
  '/transfers',
  requireSession,
  customRequireRole('Manager'),
  createInventoryTransfer,
);

// F09: Two-step stock transfers

// List transfers waiting to be received
router.get(
  '/transfers/pending',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  getPendingF09Transfers,
);

// View an individual transfer and its lines
router.get(
  '/transfers/:transferId',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  getF09TransferDetails,
);

// Dispatch stock into the transit location
router.post(
  '/transfers/dispatch',
  requireSession,
  customRequireRole('Manager'),
  dispatchF09Transfer,
);

// Receive stock at the destination location
router.post(
  '/transfers/:transferId/receive',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  receiveF09Transfer,
);

// Cancel an in-transit transfer and return stock to its source
router.post(
  '/transfers/:transferId/cancel',
  requireSession,
  customRequireRole('Manager'),
  cancelF09Transfer,
);

// Reject an in-transit transfer and return stock to its source
router.post(
  '/transfers/:transferId/reject',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  rejectF09Transfer,
);

// Preserve F01 stock-level, adjustment, and transfer contracts.
router.post(
  '/adjustments',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff'),
  createInventoryAdjustment,
);

export default router;
