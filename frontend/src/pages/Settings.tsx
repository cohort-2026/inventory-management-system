import { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import SelectField from "../components/SelectField";
import { useAuth } from "../utils/AuthContext";

const SETTINGS_KEY = "inventory-app-settings";

type DisplaySettings = {
  defaultLocation: string;
  rowsPerPage: string;
};

const DEFAULT_SETTINGS: DisplaySettings = {
  defaultLocation: "main",
  rowsPerPage: "25",
};

function isDisplaySettings(value: unknown): value is DisplaySettings {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const settings = value as Record<string, unknown>;
  return (
    (settings.defaultLocation === "main" || settings.defaultLocation === "storage") &&
    (settings.rowsPerPage === "10" ||
      settings.rowsPerPage === "25" ||
      settings.rowsPerPage === "50")
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedSettings === null) {
        return;
      }

      const parsed: unknown = JSON.parse(savedSettings);
      if (isDisplaySettings(parsed)) {
        setSettings(parsed);
      } else {
        setError("Saved display settings are invalid. Choose your preferences and save again.");
      }
    } catch {
      setError("Could not load saved display settings from this browser.");
    }
  }, []);

  function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      setMessage("Settings saved in this browser.");
    } catch {
      setError("Could not save settings in this browser.");
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Settings" subtitle="Manage your account and display preferences." />

      <Card title="Account">
        <div className="info-grid">
          <div>
            <span className="info-item-label">Username</span>
            <span className="info-item-value">{user?.username ?? "Unavailable"}</span>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: "var(--space-5)" }}>
        <Card title="Display preferences">
          <form onSubmit={saveSettings}>
            <div className="form-grid">
              <SelectField
                label="Default inventory location"
                value={settings.defaultLocation}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, defaultLocation: event.target.value }))
                }
                options={[
                  { value: "main", label: "Main Warehouse" },
                  { value: "storage", label: "Storage Unit" },
                ]}
              />
              <SelectField
                label="Rows per page"
                value={settings.rowsPerPage}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, rowsPerPage: event.target.value }))
                }
                options={[
                  { value: "10", label: "10" },
                  { value: "25", label: "25" },
                  { value: "50", label: "50" },
                ]}
              />
            </div>

            {message && <p role="status">{message}</p>}
            {error && <p className="field-error" role="alert">{error}</p>}

            <div className="page-actions" style={{ marginTop: "var(--space-4)" }}>
              <Button type="submit">Save settings</Button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}
