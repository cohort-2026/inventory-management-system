import './config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import loginRoute from './routes/login';
import helloRoute from './routes/hello';
import registerRoute from './routes/register';
import productRoutes from './routes/productRoutes';
import { requireAuth } from './middleware/requireAuth';
import { requireRoles } from './middleware/requireRoles';

const app = express();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api', helloRoute);
app.use('/api', loginRoute);
app.use('/api', registerRoute);
app.use('/api/products', productRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/admin', requireAuth, requireRoles('manager'), (_req, res) => {
  res.json({ message: 'Admin-only data.' });
});

export default app;