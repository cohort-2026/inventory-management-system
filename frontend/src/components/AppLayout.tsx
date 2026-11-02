import type { ReactNode } from "react";
import Sidebar from "./SideBar"
import Topbar from "./TopBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Topbar />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}