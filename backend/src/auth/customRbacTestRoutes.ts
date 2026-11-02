
import { Router } from 'express';

import {
  requireSession,
} from '../middleware/requireSession';

import {
  customRequireRole,
  resolveAuthenticatedRole,
} from '../middleware/customRequireRole';

import type {
  RoleAuthenticatedRequest,
} from '../middleware/customRequireRole';

const router = Router();

// All test endpoints require our custom session.
router.use(requireSession);

// Display the authenticated user's database role.
router.get(
  '/whoami',
  async (req: RoleAuthenticatedRequest, res) => {
    const user = req.authenticatedUser;

    if (!user) {
      res.status(401).json({
        error: 'Authentication required',
      });
      return;
    }

    try {
      const role =
        await resolveAuthenticatedRole(
          user.roleId,
        );

      if (!role) {
        res.status(403).json({
          error: 'No recognized role assigned',
        });
        return;
      }

      res.status(200).json({
        user,
        role,
      });
    } catch (error) {
      console.error(
        'Custom RBAC role inspection failed:',
        error,
      );

      res.status(503).json({
        error: 'Authorization service unavailable',
      });
    }
  },
);

// Viewer, Inventory Staff and Manager.
router.get(
  '/viewer',
  customRequireRole(
    'Viewer',
    'Inventory Staff',
    'Manager',
  ),
  (_req, res) => {
    res.status(200).json({
      message: 'Viewer-level access granted',
    });
  },
);

// Inventory Staff and Manager.
router.get(
  '/staff',
  customRequireRole(
    'Inventory Staff',
    'Manager',
  ),
  (_req, res) => {
    res.status(200).json({
      message: 'Staff-level access granted',
    });
  },
);

// Manager only.
router.get(
  '/manager',
  customRequireRole('Manager'),
  (_req, res) => {
    res.status(200).json({
      message: 'Manager-level access granted',
    });
  },
);

export default router;
