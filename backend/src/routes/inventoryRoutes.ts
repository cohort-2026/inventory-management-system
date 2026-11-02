
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// Any authenticated user can view inventory.
router.get("/inventory", requireAuth, (req, res) => {
  res.json({ message: "Inventory access granted." });
});

// Only staff or admins can adjust stock.
router.patch(
  "/inventory/:id/adjust",
  requireAuth,
  requireRole("staff", "admin"),
  (req, res) => {
    res.json({ message: "Stock adjustment access granted." });
  }
);

export default router;