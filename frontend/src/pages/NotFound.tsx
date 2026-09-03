import { useEffect, useState } from 'react';
import { getHello } from '../services/api';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Sorry, The page you are looking for does not exist.</h1>
      <p>Please try our other pages...</p>

      <Link to="/">Go back to Home</Link>
    </div>
  );
}