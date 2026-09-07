import { Link } from 'react-router-dom';
import Navbar from '../components/NavBar';

export default function InventoryCount() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <Navbar/>
      <h1>Inventory Count</h1>
      <p>Welcome to the Inventory Count page!</p>

      <Link to="/">Go back to Home</Link>
    </div>
  );
}