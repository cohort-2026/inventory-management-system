import { Link } from 'react-router-dom';
import Navbar from '../components/NavBar';

export default function InventoryOverview() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <Navbar/>
      <h1>Inventory Overview</h1>
      <p>Welcome to the Inventory Overview page!</p>

      <Link to="/">Go back to Home</Link>
    </div>
  );
}