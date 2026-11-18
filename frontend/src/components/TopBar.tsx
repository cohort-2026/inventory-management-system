import { useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { useAuth } from "../utils/AuthContext";
import LogoutButton from "./LogoutButton";

export default function Topbar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const username = user?.username ?? "Account";
  const initial = username.charAt(0).toUpperCase();

  return (
    <header className="app-topbar">
      <div className="topbar-account-area">
        <div className="user-menu">
          <button
            className="user-menu-trigger"
            type="button"
            aria-expanded={open}
            aria-controls="user-menu-panel"
            onClick={() => setOpen((previous) => !previous)}
          >
            <span className="user-avatar">
              {user ? initial : <UserRound size={17} />}
            </span>

            <span className="user-menu-name">{username}</span>

            <ChevronDown
              size={16}
              className={`user-menu-chevron ${open ? "open" : ""}`}
            />
          </button>

          {open && (
            <div
              className="user-menu-panel"
              id="user-menu-panel"
            >
              <div className="user-menu-info">
                <span className="user-menu-label">SIGNED IN AS</span>
                <span className="user-menu-username">{username}</span>
              </div>

              <div className="user-menu-divider" />

              <LogoutButton />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}