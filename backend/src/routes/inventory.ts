import { Router } from "express";
import { getInventory } from "../controllers/inventoryController";
import { requireSession } from "../middleware/requireSession";

const router = Router();

// FR-11: View Inventory - requires custom-auth session, any role can view
router.get("/", requireSession, getInventory);

export default router;