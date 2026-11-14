
import { Router } from 'express';
import { getReasonCodes } from '../controllers/reasonCodeController';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

const router = Router();

// F01: Active reason codes — available to all authorised roles.
router.get(
  '/',
  requireSession,
  customRequireRole('Manager', 'Inventory Staff', 'Viewer'),
  getReasonCodes,
);

export default router;
