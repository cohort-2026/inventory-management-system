import { NavLink } from "react-router-dom";
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
} from "lucide-react";
import { useAuth } from "../utils/AuthContext";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Products", path: "/product_list", icon: Package },
  { label: "Inventory", path: "/inventory", icon: Boxes },
  { label: "Counts", path: "/inventory_count", icon: ClipboardCheck },
  { label: "Locations", path: "/locations", icon: MapPin },
  { label: "Movement History", path: "/movements", icon: ArrowLeftRight },
  { label: "Suppliers", path: "/suppliers", icon: Truck },
  { label: "Receiving", path: "/receiving", icon: ClipboardList },
  { label: "Settings", path: "/settings", icon: Settings },
];

export default function Sidebar() {
  const { user } = useAuth();
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">
          <Boxes size={18} />
        </span>
        <span>Inventory App</span>
      </div>

      <nav aria-label="Main navigation">
        <p className="sidebar-section-label">WORKSPACE</p>

        <ul className="sidebar-nav">
          {NAV_ITEMS
            .filter(
              (item) =>
                item.path !== "/settings" ||
                user?.roleName === "Manager"
            )
            .map((item) => {
              const Icon = item.icon;

              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `sidebar-link${isActive ? " active" : ""}`
                    }
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
        </ul>
      </nav>
    </aside>
  );
}