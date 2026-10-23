import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './utils/AuthContext';
import ProtectedRoute from './components/ProtectedRoutes';
import Home from './pages/Home';
import  Login from './pages/Login';
import NotFound from './pages/NotFound';
import ProductList from './pages/ProductList';
import ProductDetails from './pages/ProductDetails';
import CreateProduct from './pages/CreateProduct';
import AdjustStock from './pages/AdjustStock';
import TransferStock from './pages/TransferStock';
import InventoryOverview from './pages/InventoryOverview';
import InventoryCount from './pages/InventoryCount';
import StockMovementHistory from './pages/StockMovementHistory';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import SupabaseLoginPage from './pages/SupabaseLoginPage';
import AuthShowcase from './pages/AuthShowcase';
import RbacShowcase from './pages/RbacShowcase';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          {/* <Route path="/login" element={<Login />} /> */}
          <Route path="/login" element={<SupabaseLoginPage />} />
          <Route path="*" element={<NotFound />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth-showcase" element={<ProtectedRoute><AuthShowcase /></ProtectedRoute>} />
          <Route path="/rbac-showcase" element={<ProtectedRoute><RbacShowcase /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/product_list" element={<ProtectedRoute><ProductList /></ProtectedRoute>} />
          <Route path="/product_list/:sku" element={<ProtectedRoute><ProductDetails /></ProtectedRoute>} />
          <Route path="/create_product" element={<ProtectedRoute><CreateProduct /></ProtectedRoute>} />
          <Route path="/adjust_stock" element={<ProtectedRoute><AdjustStock /></ProtectedRoute>} />
          <Route path="/transfer_stock" element={<ProtectedRoute><TransferStock /></ProtectedRoute>} />
          <Route path="/inventory_overview" element={<ProtectedRoute><InventoryOverview /></ProtectedRoute>} />
          <Route path="/inventory_count" element={<ProtectedRoute><InventoryCount /></ProtectedRoute>} />
          <Route path="/stock_movement_history" element={<ProtectedRoute><StockMovementHistory /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;