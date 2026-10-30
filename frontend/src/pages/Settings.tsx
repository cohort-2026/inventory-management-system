
import { useEffect, useState } from 'react';

import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';

type SystemRole =
  | 'Manager'
  | 'Inventory Staff'
  | 'Viewer';

type ManagedUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  roleId: string;
  roleName: SystemRole;
};

type Role = {
  roleId: string;
  name: SystemRole;
};

type UsersResponse = {
  items: ManagedUser[];
  roles: Role[];
};

type UpdateResponse = {
  user?: ManagedUser;
  error?: string;
};

const API_BASE =
  import.meta.env.VITE_API_URL ??
  'http://localhost:5000';

async function readError(
  response: Response,
): Promise<string> {
  const body: unknown =
    await response.json().catch(() => ({}));

  if (
    body !== null &&
    typeof body === 'object' &&
    'error' in body &&
    typeof body.error === 'string'
  ) {
    return body.error;
  }

  return `Request failed (HTTP ${response.status}).`;
}

export default function Settings() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const [selectedRoles, setSelectedRoles] =
    useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingUserId, setSavingUserId] =
    useState<string | null>(null);

  const [rowErrors, setRowErrors] =
    useState<Record<string, string>>({});

  const [successMessage, setSuccessMessage] =
    useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers(): Promise<void> {
      setLoading(true);
      setLoadError('');

      try {
        const response = await fetch(
          `${API_BASE}/api/admin/users`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(await readError(response));
        }

        const data: UsersResponse = await response.json();

        if (
          !Array.isArray(data.items) ||
          !Array.isArray(data.roles)
        ) {
          throw new Error(
            'Unexpected user management response.',
          );
        }

        if (!controller.signal.aborted) {
          setUsers(data.items);
          setRoles(data.roles);

          setSelectedRoles(
            Object.fromEntries(
              data.items.map((user) => [
                user.id,
                user.roleId,
              ]),
            ),
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Unable to load users.',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadUsers();

    return () => controller.abort();
  }, []);

  async function saveRole(
    user: ManagedUser,
  ): Promise<void> {
    if (savingUserId !== null) {
      return;
    }

    const roleId = selectedRoles[user.id];

    if (!roleId || roleId === user.roleId) {
      return;
    }

    setSavingUserId(user.id);
    setSuccessMessage('');

    setRowErrors((current) => ({
      ...current,
      [user.id]: '',
    }));

    try {
      const response = await fetch(
        `${API_BASE}/api/admin/users/${encodeURIComponent(user.id)}/role`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roleId }),
        },
      );

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data: UpdateResponse = await response.json();

      if (!data.user) {
        throw new Error(
          'The server did not return the updated user.',
        );
      }

      const updated = data.user;

      setUsers((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      );

      setSelectedRoles((current) => ({
        ...current,
        [updated.id]: updated.roleId,
      }));

      setSuccessMessage(
        `Role updated successfully for ${updated.email}.`,
      );
    } catch (error) {
      setRowErrors((current) => ({
        ...current,
        [user.id]:
          error instanceof Error
            ? error.message
            : 'Unable to update role.',
      }));
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <AppLayout>
      <PageHeader
        breadcrumb="Administration / Settings"
        title="Settings"
      />

      <p
        className="page-subtitle"
        style={{
          marginBottom: 'var(--space-5)',
        }}
      >
        Manage application users and their assigned roles.
      </p>

      <Card title="User Management">
        {loading ? (
          <div
            className="card-body"
            role="status"
          >
            Loading registered users...
          </div>
        ) : loadError ? (
          <div className="card-body">
            <p className="field-error" role="alert">
              {loadError}
            </p>
          </div>
        ) : (
          <div className="card-body">
            {successMessage && (
              <p
                role="status"
                style={{
                  color: 'var(--color-success)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {successMessage}
              </p>
            )}

            <p
              className="page-subtitle"
              style={{
                marginBottom: 'var(--space-4)',
              }}
            >
              {users.length} registered user
              {users.length === 1 ? '' : 's'}
            </p>

            {users.length === 0 ? (
              <p className="table-empty">
                No registered users found.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">User</th>
                      <th scope="col">Status</th>
                      <th scope="col">Current Role</th>
                      <th scope="col">Assign Role</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {users.map((user) => {
                      const selected =
                        selectedRoles[user.id] ??
                        user.roleId;

                      const hasChanges =
                        selected !== user.roleId;

                      const saving =
                        savingUserId === user.id;

                      return (
                        <tr key={user.id}>
                          <td>
                            <strong>
                              {[
                                user.firstName,
                                user.lastName,
                              ]
                                .filter(Boolean)
                                .join(' ') || 'Unnamed User'}
                            </strong>

                            <div className="field-hint">
                              {user.email}
                            </div>
                          </td>

                          <td>
                            {user.status}
                          </td>

                          <td>
                            {user.roleName}
                          </td>

                          <td>
                            <label
                              className="field-label"
                              htmlFor={`role-${user.id}`}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  width: '1px',
                                  height: '1px',
                                  padding: 0,
                                  overflow: 'hidden',
                                  clip: 'rect(0, 0, 0, 0)',
                                  whiteSpace: 'nowrap',
                                  border: 0,
                                }}
                              >
                                Role for {user.email}
                              </span>
                            </label>

                            <select
                              id={`role-${user.id}`}
                              className="field-select"
                              value={selected}
                              disabled={savingUserId !== null}
                              aria-invalid={
                                !!rowErrors[user.id]
                              }
                              aria-describedby={
                                rowErrors[user.id]
                                  ? `role-error-${user.id}`
                                  : undefined
                              }
                              onChange={(event) => {
                                setSelectedRoles(
                                  (current) => ({
                                    ...current,
                                    [user.id]:
                                      event.target.value,
                                  }),
                                );

                                setSuccessMessage('');

                                setRowErrors(
                                  (current) => ({
                                    ...current,
                                    [user.id]: '',
                                  }),
                                );
                              }}
                            >
                              {roles.map((role) => (
                                <option
                                  key={role.roleId}
                                  value={role.roleId}
                                >
                                  {role.name}
                                </option>
                              ))}
                            </select>

                            {rowErrors[user.id] && (
                              <p
                                id={`role-error-${user.id}`}
                                className="field-error"
                                role="alert"
                              >
                                {rowErrors[user.id]}
                              </p>
                            )}
                          </td>

                          <td>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={
                                !hasChanges ||
                                savingUserId !== null
                              }
                              onClick={() => {
                                void saveRole(user);
                              }}
                            >
                              {saving
                                ? 'Saving...'
                                : 'Save Role'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </AppLayout>
  );
}
