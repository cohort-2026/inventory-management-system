import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import CreateProduct from './pages/CreateProduct';
import AdjustStock from './pages/AdjustStock';
import TransferStock from './pages/TransferStock'
import InventoryOverview from './pages/InventoryOverview';
import InventoryCount from './pages/InventoryCount';
import StockMovementHistory from './pages/StockMovementHistory';
import Dashboard from './pages/Dashboard';
import { AuthProvider } from './utils/AuthContext';
import ProtectedRoute from './components/ProtectedRoutes';

function App() {

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<NotFound />} />
          <Route path="/create_product" element={   
            <ProtectedRoute>
              <CreateProduct />
            </ProtectedRoute>
          } />
          <Route path="/adjust_stock" element={<AdjustStock />} />
          <Route path="/transfer_stock" element={<TransferStock />} />
          <Route path="/inventory_overview" element={<InventoryOverview />} />
          <Route path="/inventory_count" element={<InventoryCount />} />
          <Route path="/stock_movement_history" element={<StockMovementHistory />} />

          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App;