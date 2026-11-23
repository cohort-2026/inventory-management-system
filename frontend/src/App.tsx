
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { AuthProvider } from "./utils/AuthContext";
import ProtectedRoute from "./components/ProtectedRoutes";

import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import ProductList from "./pages/ProductList";
import ProductDetails from "./pages/ProductDetails";
import CreateProduct from "./pages/CreateProduct";
import AdjustStock from "./pages/AdjustStock";
import TransferStock from "./pages/TransferStock";
import InventoryOverview from "./pages/InventoryOverview";
import InventoryCount from "./pages/InventoryCount";
import InventoryCountDetail from "./pages/InventoryCountDetail";
import StockMovementHistory from "./pages/StockMovementHistory";
import Dashboard from "./pages/Dashboard";
import Register from "./pages/Register";
import CustomLoginPage from "./pages/CustomLoginPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ResendVerificationPage from "./pages/ResendVerificationPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import Locations from "./pages/Locations";
import Settings from "./pages/Settings";
import Suppliers from "./pages/Suppliers";
import Receiving from "./pages/Receiving";
import ReceivingDetail from "./pages/ReceivingDetail";
import Reorder from "./pages/Reorder";

function LegacyInventoryRedirect() {
  const location = useLocation();
  return <Navigate to={`/inventory${location.search}`} replace />;
}

function LegacyMovementRedirect() {
  const location = useLocation();

  return (
    <Navigate
      to={`/movements${location.search}`}
      replace
    />
  );
}

function LegacyProductRedirect() {
  return <Navigate to="/product_list" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<CustomLoginPage />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/product_list"
            element={
              <ProtectedRoute>
                <ProductList />
              </ProtectedRoute>
            }
          />

          <Route
            path="/products/:id"
            element={
              <ProtectedRoute>
                <ProductDetails />
              </ProtectedRoute>
            }
          />

          <Route
            path="/product_list/:sku"
            element={
              <ProtectedRoute>
                <LegacyProductRedirect />
              </ProtectedRoute>
            }
          />

          <Route
            path="/create_product"
            element={
              <ProtectedRoute>
                <CreateProduct />
              </ProtectedRoute>
            }
          />

          <Route
            path="/products/new"
            element={
              <ProtectedRoute>
                <CreateProduct />
              </ProtectedRoute>
            }
          />

          <Route
            path="/adjust_stock"
            element={
              <ProtectedRoute allowedRoles={["Manager", "Inventory Staff"]}>
                <AdjustStock />
              </ProtectedRoute>
            }
          />

          <Route
            path="/transfer_stock"
            element={
              <ProtectedRoute allowedRoles={["Manager", "Inventory Staff"]}>
                <TransferStock />
              </ProtectedRoute>
            }
          />

          <Route
            path="/inventory_overview" element={<LegacyInventoryRedirect />}
          />

          <Route
            path="/inventory"
            element={<ProtectedRoute><InventoryOverview /></ProtectedRoute>}
          />
          <Route
            path="/inventory_count"
            element={
              <ProtectedRoute>
                <InventoryCount />
              </ProtectedRoute>
            }
          />

          <Route
            path="/inventory_count/:countId"
            element={
              <ProtectedRoute>
                <InventoryCountDetail />
              </ProtectedRoute>
            }
          />

          <Route
            path="/movements"
            element={
              <ProtectedRoute>
                <StockMovementHistory />
              </ProtectedRoute>
            }
          />

          <Route
            path="/stock_movement_history"
            element={<LegacyMovementRedirect />}
          />

          <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
          <Route path="/receiving" element={<ProtectedRoute><Receiving /></ProtectedRoute>} />
          <Route path="/receiving/:id" element={<ProtectedRoute><ReceivingDetail /></ProtectedRoute>} />
          <Route
            path="/locations"
            element={
              <ProtectedRoute>
                <Locations />
              </ProtectedRoute>
            }
          />

          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route
            path="/resend-verification"
            element={<ResendVerificationPage />}
          />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route
           path="/reorder"
           element={
              <ProtectedRoute>
                <Reorder />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
