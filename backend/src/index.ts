import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helloRoute from './routes/hello';
import { requireAuth } from './middleware/requireAuth';
import { requireRole } from './middleware/requireRole';

import supabaseAuthRoutes from "./auth/supabaseAuthRoutes";
import customAuthRoutes from "./auth/customAuthRoutes";
import productsRoute from "./routes/products";
import categoriesRouter from "./routes/categories";
import locationsRoute from "./routes/locations";
import adminUsersRoute from './routes/adminRoutes';
import inventoryRoutes from "./routes/inventory";
import inventoryCountsRouter from './routes/inventoryCounts';
import stockMovementsRouter from './routes/stockMovements'


const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// ROUTES THAT ARE TEST ROUTES
app.use('/api', helloRoute);
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ROUTES THAT ARE FOR AUTHENTICATION & AUTHORIZATION
// New authentication is isolated during development
app.use('/api/custom-auth', customAuthRoutes);

app.get('/api/admin', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ message: 'Admin-only data.' });
})

// ROUTES THAT ARE CORE FEATURES

// Product creation - FR-03, BR-01
app.use('/api/products', productsRoute);
app.use('/api/categories', categoriesRouter);

// Locations
app.use('/api/locations', locationsRoute);

// Admin related routes
app.use('/api/admin/users', adminUsersRoute);

app.use('/api/inventory', inventoryRoutes)
app.use('/api/inventory/counts', inventoryCountsRouter);
app.use('/api/stock-movements', stockMovementsRouter);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
