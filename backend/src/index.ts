import './config';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import loginRoute from './routes/login';
import helloRoute from './routes/hello';
import registerRoute from './routes/register';
import { requireAuth } from './middleware/requireAuth';
import { requireRole } from './middleware/requireRole';

import supabaseAuthRoutes from "./auth/supabaseAuthRoutes";
import customAuthRoutes from "./auth/customAuthRoutes";
import productsRoute from "./routes/products";
import categoriesRouter from "./routes/categories";
import locationsRoute from "./routes/locations";


const app = express();

app.use(cors({ origin: ['http://localhost:5173'], credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ROUTES THAT ARE TEST ROUTES
app.use('/api', helloRoute);
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ROUTES THAT ARE FOR AUTHENTICATION & AUTHORIZATION
// New authentication is isolated during development
if (process.env.NODE_ENV === 'development') {
  app.use('/api/custom-auth', customAuthRoutes);
}

app.get('/api/admin', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ message: 'Admin-only data.' });
})

// ROUTES THAT ARE CORE FEATURES

// Product creation - FR-03, BR-01
app.use('/api/products', productsRoute);
app.use('/api/categories', categoriesRouter);

// Locations
app.use('/api/locations', locationsRoute);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});