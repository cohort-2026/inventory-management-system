import { Link } from 'react-router-dom';
import Navbar from '../components/NavBar';


export default function TransferStock() {
  return ( 
      <div style={{padding: '2rem', fontFamily: 'sans-serif' }}>
        <Navbar/>
        <h1>Transfer Stock</h1>
        

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px'}}>
          <Link to="/dashboard">Go to Dashboard</Link>
          <Link to="/products">Go to Products</Link>
          <Link to="/inventory">Go to Inventory</Link>
          <Link to="/counts">Go to Counts</Link>
          <Link to="/locations">Go to Locations</Link>
          <Link to="/reports">Go to Reports</Link>
          <Link to="/settings">Go to Settings</Link>
          <Link to="/login">Go to Login</Link>
          <Link to="/Home">Go to Home</Link>
          <Link to="/dashboard">Go to Dashboard</Link>
        </div>

      </div>
  
  );
}