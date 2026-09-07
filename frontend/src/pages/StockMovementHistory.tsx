import { Link } from 'react-router-dom';
import Navbar from '../components/NavBar';

export default function StockMovementHistory() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <Navbar/>
      <h1>Stock Movement History</h1>
      <p>Welcome to the Stock Movement History page!</p>

      <Link to="/">Go back to Home</Link>
    </div>
  );
}