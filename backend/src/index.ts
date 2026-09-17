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
import authRoute from './routes/authRoutes';
import authRoutes from './routes/authRoutes';



const app = express();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api', helloRoute);
app.use('/api', loginRoute);
app.use('/api', registerRoute);
app.use('/api/auth', authRoutes);


app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/admin', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ message: 'Admin-only data.' });
})

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});