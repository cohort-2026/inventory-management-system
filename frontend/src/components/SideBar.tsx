
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ClipboardCheck,
  MapPin,
  ArrowLeftRight,
  Settings,
  Truck,
  ClipboardList,
  RefreshCw,
} from "lucide-react";

const API_BASE_URL = `${
  import.meta.env.VITE_API_URL ?? "http://localhost:5000"
}/api`;

type ReorderResponse = {
  count?: number;
  reorder_items?: unknown[];
};

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Products", path: "/product_list", icon: Package },
  { label: "Inventory", path: "/inventory", icon: Boxes },
  { label: "Replenishment", path: "/reorder", icon: RefreshCw },
  { label: "Counts", path: "/counts", icon: ClipboardCheck },
  { label: "Locations", path: "/locations", icon: MapPin },
  { label: "Movement History", path: "/movements", icon: ArrowLeftRight },
  { label: "Suppliers", path: "/suppliers", icon: Truck },
  { label: "Receiving", path: "/receiving", icon: ClipboardList },
  { label: "Settings", path: "/settings", icon: Settings },
  { label: "Incoming Transfers", path: "/incoming-transfers", icon: ArrowLeftRight },
];

export default function Sidebar() {
  const [reorderCount, setReorderCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    const controller = new AbortController();

    const fetchReorderCount = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/reorder`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to fetch replenishment count.");
        }

        const data: ReorderResponse = await response.json();

        const count =
          typeof data.count === "number"
            ? data.count
            : data.reorder_items?.length ?? 0;

        setReorderCount(count);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("Unable to load replenishment count:", error);
      }
    };

    fetchReorderCount();

    return () => controller.abort();
  }, [location.pathname]);

  return (
    <aside className="app-sidebar enterprise-navy-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true">
          <Boxes size={18} />
        </span>
        <span className="sidebar-brand-name">Inventory App</span>
      </div>

      <nav aria-label="Main navigation">
        <p className="sidebar-section-label">WORKSPACE</p>

        <ul className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `sidebar-link${isActive ? " active" : ""}`
                  }
                >
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" />

                  <span>{item.label}</span>

                  {item.path === "/reorder" && reorderCount > 0 && (
                    <span
                      className="sidebar-count-badge"
                      aria-label={`${reorderCount} items need replenishment`}
                      style={{
                        marginLeft: "auto",
                        minWidth: "22px",
                        height: "22px",
                        padding: "0 6px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "999px",
                        backgroundColor: "#dc2626",
                        color: "#ffffff",
                        fontSize: "11px",
                        fontWeight: 700,
                      }}
                    >
                      {reorderCount}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
