import { useEffect, useState } from 'react';
import { getHello } from '../services/api';
import Navbar from '../components/NavBar';

export default function Home() {
  const [message, setMessage] = useState('Connecting to backend...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHello()
      .then((data) => setMessage(`${data.message} (at ${data.timestamp})`))
      .catch(() => setError('Could not reach the backend. Check if it is running on port 5000?'));
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <Navbar/>
      <h1>Inventory Management System</h1>
      {error ? <p style={{ color: 'red' }}>{error}</p> : <p>{message}</p>}
    </div>
  );
}