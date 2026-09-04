import { Link } from 'react-router-dom';

export default function ProductDetails() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Product Details</h1>
      <p>Welcome to the Product Details page!</p>

      <Link to="/">Go back to Home</Link>
    </div>
  );
}