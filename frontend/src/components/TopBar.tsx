import { useState } from "react";
import { useAuth } from "../utils/AuthContext";
import LogoutButton from "./LogoutButton";
import SearchInput from "./SearchInput";

export default function Topbar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="app-topbar">
      <SearchInput />
      <div className="user-menu">
        <button className="user-menu-trigger" onClick={() => setOpen((o) => !o)}>
          {user?.username ?? "Account"}
          <span className="user-menu-caret">▾</span>
        </button>
        {open && (
          <div className="user-menu-panel">
            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}