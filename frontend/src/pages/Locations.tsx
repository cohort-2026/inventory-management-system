import { useCallback, useEffect, useState, type FormEvent } from "react";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import "./Locations.css";

type Location = {
  location_id: string;
  code: string;
  name: string;
};

const API_URL = `${import.meta.env.VITE_API_URL}/api/locations/`;

function isLocation(value: unknown): value is Location {
  return (
    value !== null &&
    typeof value === "object" &&
    "location_id" in value &&
    typeof value.location_id === "string" &&
    "code" in value &&
    typeof value.code === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

async function fetchLocations(): Promise<Location[]> {
  const response = await fetch(API_URL, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Could not load locations (HTTP ${response.status}).`);
  }

  const data: unknown = await response.json();

  const list =
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray(data.items)
      ? data.items
      : null;

  if (!list || !list.every(isLocation)) {
    throw new Error("The server returned an unexpected locations response.");
  }

  return list;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export default function Locations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  useEffect(() => {
    let active = true;

    fetchLocations()
      .then((list) => {
        if (active) {
          setLocations(list);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshLocations = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      setLocations(await fetchLocations());
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError("");
    setSuccessMessage("");

    const cleanCode = code.trim();
    const cleanName = name.trim();

    if (!cleanCode || !cleanName) {
      setFormError("Enter both a location code and a location name.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          code: cleanCode,
          name: cleanName,
          description: description.trim() || null,
          address: address.trim() || null,
          status,
        }),
      });

      if (!response.ok) {
        let message = `Could not create location (HTTP ${response.status}).`;

        try {
          const data: unknown = await response.json();

          if (data && typeof data === "object") {
            if ("error" in data && typeof data.error === "string") {
              message = data.error;
            } else if ("message" in data && typeof data.message === "string") {
              message = data.message;
            }
          }
        } catch {
          // Retain the HTTP status message if the response is not JSON.
        }

        setFormError(message);
        return;
      }

      // Clear the form after successful creation.
      setCode("");
      setName("");
      setDescription("");
      setAddress("");
      setStatus("active");

      setSuccessMessage("Location created successfully.");

      // Refresh the locations table.
      await refreshLocations();

    } catch (error: unknown) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="locations-page">
        <PageHeader
          title="Locations"
          subtitle="Manage inventory storage locations."
          actions={
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void refreshLocations()}
              disabled={loading || saving}
            >
              Refresh
            </button>
          }
        />

        <div className="locations-layout">
          <section
            className="locations-panel"
            aria-labelledby="create-location-title"
          >
            <h2 id="create-location-title">Create a location</h2>

            <form onSubmit={handleSubmit}>

              {/* Location Code */}
              <div className="field">
                <label className="field-label" htmlFor="location-code">
                  Location code *
                </label>

                <input
                  className="field-input"
                  id="location-code"
                  name="code"
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="e.g. WH-001"
                  required
                  disabled={saving}
                />
              </div>

              {/* Location Name */}
              <div className="field">
                <label className="field-label" htmlFor="location-name">
                  Location name *
                </label>

                <input
                  className="field-input"
                  id="location-name"
                  name="name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Main Warehouse"
                  required
                  disabled={saving}
                />
              </div>

              {/* Description */}
              <div className="field">
                <label className="field-label" htmlFor="location-description">
                  Description
                </label>

                <textarea
                  className="field-input"
                  id="location-description"
                  name="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe this storage location..."
                  rows={3}
                  disabled={saving}
                />
              </div>

              {/* Address */}
              <div className="field">
                <label className="field-label" htmlFor="location-address">
                  Address
                </label>

                <input
                  className="field-input"
                  id="location-address"
                  name="address"
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="e.g. Johannesburg, Gauteng"
                  disabled={saving}
                />
              </div>

              {/* Status */}
              <div className="field">
                <label className="field-label" htmlFor="location-status">
                  Status
                </label>

                <select
                  className="field-input"
                  id="location-status"
                  name="status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as "active" | "inactive")
                  }
                  disabled={saving}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Error Message */}
              {formError && (
                <p className="locations-error" role="alert">
                  {formError}
                </p>
              )}

              {/* Success Message */}
              {successMessage && (
                <p className="locations-success" role="status">
                  {successMessage}
                </p>
              )}

              {/* Submit Button */}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Create Location"}
              </button>

            </form>
          </section>

          <section className="locations-panel" aria-labelledby="all-locations-title">
            <div className="locations-list-heading">
              <h2 id="all-locations-title">All locations</h2>
              {!loading && !loadError && (
                <span className="locations-count">{locations.length} total</span>
              )}
            </div>
            {loading ? (
              <p className="locations-state" role="status">Loading locations...</p>
            ) : loadError ? (
              <div className="locations-state">
                <p className="locations-error" role="alert">{loadError}</p>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => void refreshLocations()}
                >
                  Try again
                </button>
              </div>
            ) : locations.length === 0 ? (
              <p className="locations-state">No locations have been created yet.</p>
            ) : (
              <div className="locations-table-wrap">
                <table className="locations-table">
                  <thead>
                    <tr>
                      <th scope="col">Code</th>
                      <th scope="col">Location name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((location) => (
                      <tr key={location.location_id}>
                        <td>{location.code}</td>
                        <td>{location.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
