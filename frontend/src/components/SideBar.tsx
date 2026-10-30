import { NavLink } from "react-router-dom";
import { useAuth } from '../utils/AuthContext';

const NAV_ITEMS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Products", path: "/product_list" },
  { label: "Inventory", path: "/inventory_overview" },
  { label: "Counts", path: "/inventory_count" },
  { label: "Locations", path: "/locations" },
  { label: "Reports", path: "/reports" },
  { label: "Settings", path: "/settings" },
];

export default function Sidebar() {
  const { user } = useAuth();
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" />
        Inventory App
      </div>
      <nav>
        <ul className="sidebar-nav">
          {NAV_ITEMS
          .filter((item) =>
            item.path !== '/settings' ||
            user?.roleName === 'Manager',
          )
          .map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}