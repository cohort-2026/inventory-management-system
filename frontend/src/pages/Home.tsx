<<<<<<< HEAD
import { useEffect, useState } from 'react';
import { getHello } from '../services/api';
import Navbar from '../components/NavBar';
=======

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Home.css";

type BackendStatus = "checking" | "online" | "offline";

const features = [
  {
    number: "01",
    icon: "▦",
    title: "Inventory tracking",
    description:
      "Keep product quantities, SKUs and stock locations organised in one central place.",
  },
  {
    number: "02",
    icon: "↗",
    title: "Stock movement",
    description:
      "Record stock adjustments and transfers to maintain a clearer inventory history.",
  },
  {
    number: "03",
    icon: "!",
    title: "Low-stock awareness",
    description:
      "Identify products that need attention before stock shortages disrupt operations.",
  },
  {
    number: "04",
    icon: "⌕",
    title: "Product management",
    description:
      "Find product information quickly and keep important product details accessible.",
  },
  {
    number: "05",
    icon: "▤",
    title: "Sales visibility",
    description:
      "Use stock and sales records to better understand inventory activity.",
  },
  {
    number: "06",
    icon: "✓",
    title: "Controlled access",
    description:
      "Support role-based access so users can work with features appropriate to their role.",
  },
];
>>>>>>> testing

export default function Home() {
  const [message, setMessage] = useState('Connecting to backend...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHello()
      .then((data) => setMessage(`${data.message} (at ${data.timestamp})`))
      .catch(() => setError('Could not reach the backend. Is it running on port 5000?'));
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <Navbar/>
      <h1>Inventory Management System</h1>
      {error ? <p style={{ color: 'red' }}>{error}</p> : <p>{message}</p>}
    </div>
  );
}