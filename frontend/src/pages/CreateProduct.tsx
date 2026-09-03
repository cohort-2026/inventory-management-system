import { useEffect, useState } from 'react';
import { getHello } from '../services/api';

export default function CreateProduct() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Inventory Management System</h1>
        <p>Welcome to the Create Product page!</p>
        <aside>
       <ul>
                <li>Product Name</li>
                <li>SKU required & unique</li>
                <li>Category required</li>
                <li>Quantities must be valid numbers</li>
                <li>Reorder level ≥ 0</li>
              </ul>
          </aside>

          </div>
  );
}