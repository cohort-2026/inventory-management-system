import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './utils/AuthContext';
import ProtectedRoute from './components/ProtectedRoutes';
import Home from './pages/Home';
<<<<<<< HEAD
import Login from './pages/Login';
=======
>>>>>>> testing
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
<<<<<<< HEAD
=======
import Register from './pages/Register';
import AuthShowcase from './pages/AuthShowcase';
import RbacShowcase from './pages/RbacShowcase';
import CustomLoginPage from './pages/CustomLoginPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ResendVerificationPage from './pages/ResendVerificationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import Locations from './pages/Locations';
import Settings from './pages/Settings';
>>>>>>> testing

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
<<<<<<< HEAD
          <Route path="/login" element={<Login />} />
=======
          {/* <Route path="/login" element={<Login />} /> */}
          <Route path="/login" element={<CustomLoginPage />} />
>>>>>>> testing
          <Route path="*" element={<NotFound />} />

          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/product_list" element={<ProtectedRoute><ProductList /></ProtectedRoute>} />
          <Route path="/product_list/:sku" element={<ProtectedRoute><ProductDetails /></ProtectedRoute>} />
          <Route path="/create_product" element={<ProtectedRoute><CreateProduct /></ProtectedRoute>} />
          <Route path="/adjust_stock" element={<ProtectedRoute><AdjustStock /></ProtectedRoute>} />
          <Route path="/transfer_stock" element={<ProtectedRoute><TransferStock /></ProtectedRoute>} />
          <Route path="/inventory_overview" element={<ProtectedRoute><InventoryOverview /></ProtectedRoute>} />
          <Route path="/inventory_count" element={<ProtectedRoute><InventoryCount /></ProtectedRoute>} />
          <Route path="/stock_movement_history" element={<ProtectedRoute><StockMovementHistory /></ProtectedRoute>} />
          <Route path="/locations" element={<ProtectedRoute><Locations /></ProtectedRoute>} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/resend-verification" element={<ResendVerificationPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />}/>
          <Route path="/reset-password" element={<ResetPasswordPage />}/>
          <Route path="/products/new" element={<ProtectedRoute><CreateProduct /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute allowedRoles={['Manager']}><Settings /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;