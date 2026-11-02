
import { Router } from 'express';

import { dbPool } from '../db/pool';
import { requireSession } from '../middleware/requireSession';
import { customRequireRole } from '../middleware/customRequireRole';

import type {
  SessionAuthenticatedRequest,
} from '../middleware/requireSession';

const router = Router();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SystemRole = 'Manager' | 'Inventory Staff' | 'Viewer';

type ManagedUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  roleId: string;
  roleName: SystemRole;
};

type RoleRow = {
  roleId: string;
  name: SystemRole;
};

const USER_SELECT = `
  SELECT
    u.user_id AS id,
    u.email,
    u.first_name AS "firstName",
    u.last_name AS "lastName",
    u.status,
    u.role_id AS "roleId",
    r.name AS "roleName"
  FROM public.users AS u
  INNER JOIN public.roles AS r
    ON r.role_id = u.role_id
`;

// GET /api/admin/users
router.get(
  '/',
  requireSession,
  customRequireRole('Manager'),
  async (_req, res): Promise<void> => {
    try {
      const [usersResult, rolesResult] = await Promise.all([
        dbPool.query<ManagedUser>(
          `${USER_SELECT}
           ORDER BY u.created_at DESC, u.user_id ASC`,
        ),
        dbPool.query<RoleRow>(
          `
            SELECT
              role_id AS "roleId",
              name
            FROM public.roles
            WHERE name IN ('Manager', 'Inventory Staff', 'Viewer')
            ORDER BY
              CASE name
                WHEN 'Manager' THEN 1
                WHEN 'Inventory Staff' THEN 2
                ELSE 3
              END
          `,
        ),
      ]);

      res.status(200).json({
        items: usersResult.rows,
        roles: rolesResult.rows,
      });
    } catch (error) {
      console.error('List admin users failed:', error);

      res.status(500).json({
        error: 'Unable to retrieve users.',
      });
    }
  },
);

// PATCH /api/admin/users/:id/role
router.patch(
  '/:id/role',
  requireSession,
  customRequireRole('Manager'),
  async (
    req: SessionAuthenticatedRequest,
    res,
  ): Promise<void> => {
    const userId = req.params.id;
    const body: unknown = req.body;

    if (
      typeof userId !== 'string' ||
      !UUID_PATTERN.test(userId)
    ) {
      res.status(400).json({
        error: 'A valid user ID is required.',
      });
      return;
    }

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      res.status(400).json({
        error: 'Request body must be a JSON object.',
      });
      return;
    }

    const fields = Object.keys(body);

    if (
      fields.length !== 1 ||
      fields[0] !== 'roleId'
    ) {
      res.status(400).json({
        error: 'Only roleId is permitted.',
      });
      return;
    }

    const roleId = (body as { roleId?: unknown }).roleId;

    if (
      typeof roleId !== 'string' ||
      !UUID_PATTERN.test(roleId)
    ) {
      res.status(400).json({
        error: 'roleId must be a valid UUID.',
      });
      return;
    }

    const client = await dbPool.connect().catch((error) => {
      console.error('Role assignment connection failed:', error);
      return null;
    });

    if (!client) {
      res.status(503).json({
        error: 'Role assignment service unavailable.',
      });
      return;
    }

    try {
      await client.query('BEGIN');

      // Serialize role changes so two administrators cannot
      // independently demote the final Managers at once.
      await client.query(
        'SELECT pg_advisory_xact_lock(71243, 1201)',
      );

      // Recheck the acting user's role inside the transaction.
      // This prevents a concurrent demotion from authorizing
      // a stale Manager request.
      const actorResult = await client.query<{
        roleName: string;
      }>(
        `
          SELECT r.name AS "roleName"
          FROM public.users u
          JOIN public.roles r ON r.role_id = u.role_id
          WHERE u.user_id = $1
            AND u.status = 'active'
        `,
        [req.authenticatedUser?.id],
      );

      if (actorResult.rows[0]?.roleName !== 'Manager') {
        await client.query('ROLLBACK');
        res.status(403).json({
          error: 'Manager permission is required.',
        });
        return;
      }

      const roleResult = await client.query<RoleRow>(
        `
          SELECT role_id AS "roleId", name
          FROM public.roles
          WHERE role_id = $1
            AND name IN (
              'Manager',
              'Inventory Staff',
              'Viewer'
            )
        `,
        [roleId],
      );

      const targetRole = roleResult.rows[0];

      if (!targetRole) {
        await client.query('ROLLBACK');
        res.status(404).json({
          error: 'The selected role does not exist.',
        });
        return;
      }

      const targetResult = await client.query<{
        id: string;
        currentRole: string;
        status: string;
      }>(
        `
          SELECT
            u.user_id AS id,
            r.name AS "currentRole",
            u.status
          FROM public.users u
          JOIN public.roles r
            ON r.role_id = u.role_id
          WHERE u.user_id = $1
          FOR UPDATE OF u
        `,
        [userId],
      );

      const target = targetResult.rows[0];

      if (!target) {
        await client.query('ROLLBACK');
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      if (
        target.status === 'active' &&
        target.currentRole === 'Manager' &&
        targetRole.name !== 'Manager'
      ) {
        const managerCount = await client.query<{
          count: string;
        }>(
          `
            SELECT COUNT(*)::text AS count
            FROM public.users u
            JOIN public.roles r
              ON r.role_id = u.role_id
            WHERE u.status = 'active'
              AND r.name = 'Manager'
          `,
        );

        if (Number(managerCount.rows[0]?.count ?? 0) <= 1) {
          await client.query('ROLLBACK');
          res.status(409).json({
            error:
              'The last active Manager cannot be reassigned.',
          });
          return;
        }
      }

      const updated = await client.query<ManagedUser>(
        `
          WITH changed AS (
            UPDATE public.users
            SET role_id = $2
            WHERE user_id = $1
            RETURNING *
          )
          SELECT
            c.user_id AS id,
            c.email,
            c.first_name AS "firstName",
            c.last_name AS "lastName",
            c.status,
            c.role_id AS "roleId",
            r.name AS "roleName"
          FROM changed c
          JOIN public.roles r
            ON r.role_id = c.role_id
        `,
        [userId, roleId],
      );

      await client.query('COMMIT');

      res.status(200).json({
        user: updated.rows[0],
      });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Role assignment rollback failed:', rollbackError);
      }

      console.error('Role assignment failed:', error);

      res.status(500).json({
        error: 'Unable to update user role.',
      });
    } finally {
      client.release();
    }
  },
);

export default router;
