import { useCallback, useEffect, useState, type FormEvent } from "react";
import AppLayout from "../components/AppLayout";
import PageHeader from "../components/PageHeader";
import "./Locations.css";

type Location = {
  id: number | string;
  code: string;
  name: string;
};

const API_URL = `${import.meta.env.VITE_API_URL ?? "http://localhost:5000"}/api/locations`;

function isLocation(value: unknown): value is Location {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    (typeof value.id === "number" || typeof value.id === "string") &&
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
    Array.isArray(data)
      ? data
      : data &&
          typeof data === "object" &&
          "locations" in data &&
          Array.isArray(data.locations)
        ? data.locations
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
        body: JSON.stringify({ code: cleanCode, name: cleanName }),
      });

      if (!response.ok) {
        let message = `Could not create location (HTTP ${response.status}).`;
        try {
          const data: unknown = await response.json();
          if (data && typeof data === "object") {
            if ("message" in data && typeof data.message === "string") {
              message = data.message;
            } else if ("error" in data && typeof data.error === "string") {
              message = data.error;
            }
          }
        } catch {
          // Keep the HTTP status message when the server does not return JSON.
        }
        setFormError(message);
        return;
      }

      setCode("");
      setName("");
      setSuccessMessage("Location created successfully.");
      await refreshLocations();
    } catch (error) {
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
          <section className="locations-panel" aria-labelledby="create-location-title">
            <h2 id="create-location-title">Create a location</h2>
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label" htmlFor="location-code">Location code</label>
                <input
                  className="field-input"
                  id="location-code"
                  name="code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="e.g. WH-001"
                  required
                  disabled={saving}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="location-name">Location name</label>
                <input
                  className="field-input"
                  id="location-name"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Main Warehouse"
                  required
                  disabled={saving}
                />
              </div>
              {formError && <p className="locations-error" role="alert">{formError}</p>}
              {successMessage && <p className="locations-success" role="status">{successMessage}</p>}
              <button className="btn btn-primary" type="submit" disabled={saving}>
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
                      <tr key={location.id}>
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
