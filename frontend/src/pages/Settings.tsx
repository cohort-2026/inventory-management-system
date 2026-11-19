
import { useEffect, useState } from 'react';

import AppLayout from '../components/AppLayout';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import { Bell, Palette, SlidersHorizontal, ShieldCheck, UsersRound, Wrench } from 'lucide-react';
import { useAuth } from '../utils/AuthContext';

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
  homeLocationId: string | null;
  homeLocationName: string | null;
};

type Role = {
  roleId: string;
  name: SystemRole;
};

type LocationOption = {
  location_id: string;
  name: string;
  status: string;
};

type UsersResponse = {
  items: ManagedUser[];
  roles: Role[];
};

type LocationsResponse = {
  items: LocationOption[];
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
  const { user: signedInUser } = useAuth();
  const isManager = signedInUser?.roleName === 'Manager';
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] =
    useState<LocationOption[]>([]);

  const [selectedRoles, setSelectedRoles] =
    useState<Record<string, string>>({});

  const [selectedLocations, setSelectedLocations] =
    useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [savingUserId, setSavingUserId] =
    useState<string | null>(null);

  const [rowErrors, setRowErrors] =
    useState<Record<string, string>>({});

  const [successMessage, setSuccessMessage] =
    useState('');

  useEffect(() => {
    // Never request Manager-only user data for Staff or Viewer sessions.
    if (!isManager) return;

    const controller = new AbortController();

    async function loadUsers(): Promise<void> {
      setLoading(true);
      setLoadError('');

      try {
        const [usersResponse, locationsResponse] =
          await Promise.all([
            fetch(`${API_BASE}/api/admin/users`, {
              credentials: 'include',
              cache: 'no-store',
              signal: controller.signal,
            }),
            fetch(`${API_BASE}/api/locations`, {
              credentials: 'include',
              cache: 'no-store',
              signal: controller.signal,
            }),
          ]);

        if (!usersResponse.ok) {
          throw new Error(
            await readError(usersResponse),
          );
        }

        if (!locationsResponse.ok) {
          throw new Error(
            await readError(locationsResponse),
          );
        }

        const usersData: UsersResponse =
          await usersResponse.json();

        const locationsData: LocationsResponse =
          await locationsResponse.json();

        if (
          !Array.isArray(usersData.items) ||
          !Array.isArray(usersData.roles) ||
          !Array.isArray(locationsData.items)
        ) {
          throw new Error(
            'Unexpected user management response.',
          );
        }

        if (!controller.signal.aborted) {
          const activeLocations =
            locationsData.items.filter(
              (location) =>
                location.status === 'active' &&
                typeof location.location_id === 'string' &&
                typeof location.name === 'string',
            );

          setUsers(usersData.items);
          setRoles(usersData.roles);
          setLocations(activeLocations);

          setSelectedRoles(
            Object.fromEntries(
              usersData.items.map((user) => [
                user.id,
                user.roleId,
              ]),
            ),
          );

          setSelectedLocations(
            Object.fromEntries(
              usersData.items.map((user) => [
                user.id,
                user.homeLocationId ?? '',
              ]),
            ),
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Unable to load user management data.',
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
  }, [isManager]);

  async function saveRole(
    user: ManagedUser,
  ): Promise<void> {
    if (!isManager || savingUserId !== null) {
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

      setSelectedLocations((current) => ({
        ...current,
        [updated.id]: updated.homeLocationId ?? '',
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

  async function saveHomeLocation(
    user: ManagedUser,
  ): Promise<void> {
    if (
      !isManager ||
      savingUserId !== null ||
      user.roleName !== 'Inventory Staff'
    ) {
      return;
    }

    const homeLocationId =
      selectedLocations[user.id];

    if (
      !homeLocationId ||
      homeLocationId === user.homeLocationId
    ) {
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
        `${API_BASE}/api/admin/users/${encodeURIComponent(user.id)}/home-location`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ homeLocationId }),
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

      setSelectedLocations((current) => ({
        ...current,
        [updated.id]: updated.homeLocationId ?? '',
      }));

      setSuccessMessage(
        `Home warehouse updated successfully for ${updated.email}.`,
      );
    } catch (error) {
      setRowErrors((current) => ({
        ...current,
        [user.id]:
          error instanceof Error
            ? error.message
            : 'Unable to update home warehouse.',
      }));
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <AppLayout>
      <div className="settings-workspace">
        <PageHeader
          breadcrumb="Workspace / Settings"
          title="Settings"
          subtitle="Account preferences and workspace configuration."
        />

        <section className="settings-hero" aria-labelledby="settings-hero-title">
          <div className="settings-hero-icon" aria-hidden="true">
            <SlidersHorizontal size={26} strokeWidth={1.8} />
          </div>
          <div className="settings-hero-copy">
            <p className="settings-eyebrow">WORKSPACE CONFIGURATION</p>
            <h2 id="settings-hero-title">Make your workspace your own</h2>
            <p>
              Explore upcoming preferences below. They are previews only:
              no changes are saved or applied.
            </p>
          </div>
          <span className="settings-role-tag">
            {signedInUser?.roleName ?? 'Account'} access
          </span>
        </section>

        <section className="settings-section" aria-labelledby="settings-preferences-title">
          <div className="settings-section-heading">
            <div>
              <p className="settings-eyebrow">PLANNED FEATURES</p>
              <h2 id="settings-preferences-title">Personal preferences</h2>
              <p>These settings are mock previews and are not operational.</p>
            </div>
            <span className="settings-mock-label">Mock · Coming later</span>
          </div>

          <div className="settings-preview-grid">
            <article className="settings-preview-card">
              <span className="settings-preview-icon" aria-hidden="true"><Palette size={20} /></span>
              <span className="settings-preview-tag">Not functional</span>
              <h3>Appearance</h3>
              <p>Choose a light or dark workspace theme and adjust display density.</p>
              <div className="settings-preview-example" aria-hidden="true">
                <span className="settings-swatch settings-swatch-blue" />
                <span className="settings-swatch settings-swatch-slate" />
                <span className="settings-preview-caption">Theme options · Preview only</span>
              </div>
            </article>

            <article className="settings-preview-card">
              <span className="settings-preview-icon" aria-hidden="true"><Bell size={20} /></span>
              <span className="settings-preview-tag">Not functional</span>
              <h3>Notifications</h3>
              <p>Configure future low-stock alerts, review reminders and email preferences.</p>
              <div className="settings-preview-example" aria-hidden="true">
                <span className="settings-preview-dot" />
                <span className="settings-preview-caption">Stock alerts · Planned</span>
              </div>
            </article>

            <article className="settings-preview-card">
              <span className="settings-preview-icon" aria-hidden="true"><Wrench size={20} /></span>
              <span className="settings-preview-tag">Not functional</span>
              <h3>Display preferences</h3>
              <p>Set future table density, default warehouse views and date formatting.</p>
              <div className="settings-preview-example" aria-hidden="true">
                <span className="settings-preview-caption">Compact tables · Planned</span>
              </div>
            </article>
          </div>
        </section>

        {isManager && (
          <section className="settings-section" aria-labelledby="settings-admin-title">
            <div className="settings-section-heading">
              <div>
                <p className="settings-eyebrow">MANAGER ACCESS</p>
                <h2 id="settings-admin-title">Administration</h2>
                <p>Manage staff access and warehouse assignments.</p>
              </div>
              <span className="settings-live-label">Live user controls</span>
            </div>

            <div className="settings-admin-note">
              <UsersRound size={20} aria-hidden="true" />
              <p>Role and home warehouse updates below are live and save to the server.</p>
            </div>
            <div className="settings-user-management">
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
                      <p role="status" className="settings-success">
                        {successMessage}
                      </p>
                    )}

                    <p className="page-subtitle settings-user-count">
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
                              <th scope="col">Home Warehouse</th>
                              <th scope="col">Action</th>
                            </tr>
                          </thead>

                          <tbody>
                            {users.map((user) => {
                              const selectedRole =
                                selectedRoles[user.id] ??
                                user.roleId;

                              const hasRoleChanges =
                                selectedRole !== user.roleId;

                              const selectedLocation =
                                selectedLocations[user.id] ??
                                user.homeLocationId ??
                                '';

                              const hasLocationChanges =
                                selectedLocation !==
                                (user.homeLocationId ?? '');

                              const saving =
                                savingUserId === user.id;

                              const isInventoryStaff =
                                user.roleName === 'Inventory Staff';

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
                                      <span className="settings-sr-only">
                                        Role for {user.email}
                                      </span>
                                    </label>

                                    <select
                                      id={`role-${user.id}`}
                                      className="field-select"
                                      value={selectedRole}
                                      disabled={savingUserId !== null}
                                      aria-invalid={
                                        !!rowErrors[user.id]
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
                                  </td>

                                  <td>
                                    {isInventoryStaff ? (
                                      <>
                                        <label
                                          className="field-label"
                                          htmlFor={`location-${user.id}`}
                                        >
                                          <span className="settings-sr-only">
                                            Home warehouse for {user.email}
                                          </span>
                                        </label>

                                        <select
                                          id={`location-${user.id}`}
                                          className="field-select"
                                          value={selectedLocation}
                                          disabled={
                                            savingUserId !== null
                                          }
                                          aria-invalid={
                                            !!rowErrors[user.id]
                                          }
                                          onChange={(event) => {
                                            setSelectedLocations(
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
                                          <option value="">
                                            Select warehouse
                                          </option>

                                          {locations.map((location) => (
                                            <option
                                              key={location.location_id}
                                              value={location.location_id}
                                            >
                                              {location.name}
                                            </option>
                                          ))}
                                        </select>

                                        {hasLocationChanges && (
                                          <button
                                            type="button"
                                            className="btn btn-primary btn-sm settings-action-gap"
                                            disabled={
                                              savingUserId !== null ||
                                              !selectedLocation
                                            }
                                            onClick={() => {
                                              void saveHomeLocation(user);
                                            }}
                                          >
                                            {saving
                                              ? 'Saving...'
                                              : 'Save Warehouse'}
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <span className="field-hint">
                                        Not applicable
                                      </span>
                                    )}
                                  </td>

                                  <td>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      disabled={
                                        !hasRoleChanges ||
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

                                    {rowErrors[user.id] && (
                                      <p
                                        className="field-error settings-row-error"
                                        role="alert"
                                      >
                                        {rowErrors[user.id]}
                                      </p>
                                    )}
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
            </div>
          </section>
        )}

        {isManager && (
          <section className="settings-section" aria-labelledby="settings-system-title">
            <div className="settings-section-heading">
              <div>
                <p className="settings-eyebrow">PLANNED · MANAGERS</p>
                <h2 id="settings-system-title">System configuration</h2>
                <p>Future administrative configuration tools. Nothing here is active.</p>
              </div>
              <span className="settings-mock-label">Mock · Coming later</span>
            </div>
            <article className="settings-preview-card settings-preview-card-wide">
              <span className="settings-preview-icon" aria-hidden="true"><ShieldCheck size={20} /></span>
              <span className="settings-preview-tag">Not functional</span>
              <h3>Security and audit preferences</h3>
              <p>Future session policies, audit-retention controls and access-review reminders.</p>
            </article>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
