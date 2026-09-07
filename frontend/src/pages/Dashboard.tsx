import { Link } from 'react-router-dom';
import Navbar from '../components/NavBar';

export default function Dashboard() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <Navbar/>
      <h1>Dashboard</h1>
      <p>Welcome to the Dashboard!</p>

        <Link to="/">Go back to Home</Link>
    </div>
  );
}