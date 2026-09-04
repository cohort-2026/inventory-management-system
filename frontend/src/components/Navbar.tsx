import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav>
      <div>
        <span>■</span> INVENTORY APP
      </div>

      <div>
        <Link to="/">Home</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/create_product">Create Product</Link>
        <Link to="/adjust_stock">Adjust Stock</Link>
        <Link to="/transfer_stock">Transfer Stock</Link>
        <Link to="/inventory_overview">Inventory Overview</Link>
        <Link to="/inventory_count">Inventory Count</Link>
        <Link to="/stock_movement_history">Stock Movement History</Link>
      </div>

      <div>
        <input type="text" placeholder="Search..." />
      </div>

      <div>
        <button type="button">John Smith ▼</button>
      </div>
    </nav>
  );
}