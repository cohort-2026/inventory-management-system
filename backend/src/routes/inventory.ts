import { Router } from 'express';
import { getInventory, getInventorySummary, exportInventoryCsv } from '../controllers/inventoryController';
import { createInventoryAdjustment } from '../controllers/inventoryAdjustmentController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';
import { createInventoryTransfer } from '../controllers/inventoryTransferController';
import { getInventoryLevel } from '../controllers/inventoryLevelController';

const router = Router();
const readable = [requireSession, customRequireRole('Manager', 'Inventory Staff', 'Viewer')];
router.get('/', ...readable, getInventory);
router.get('/summary', ...readable, getInventorySummary);
router.get('/export.csv', ...readable, exportInventoryCsv);
// Preserve F01 stock-level, adjustment, and transfer contracts.
router.get('/level', ...readable, getInventoryLevel);
router.post('/adjustments', requireSession, customRequireRole('Manager', 'Inventory Staff'), createInventoryAdjustment);
router.post('/transfers', requireSession, customRequireRole('Manager', 'Inventory Staff'), createInventoryTransfer);
export default router;
