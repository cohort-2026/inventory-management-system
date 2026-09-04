import { Link } from 'react-router-dom';

export default function ProductList() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Product List</h1>
      <p>Welcome to the Product List page!</p>

      <Link to="/">Go back to Home</Link>
    </div>
  );
}