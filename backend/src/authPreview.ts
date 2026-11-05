import express from 'express';
import supabaseAuthRoutes from './auth/supabaseAuthRoutes';
import inventoryRoute from "./routes/inventory"

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-preview' }));
app.use('/api/supabase-auth', supabaseAuthRoutes);
app.use("/api/inventory", inventoryRoute)

const port = Number(process.env.AUTH_PREVIEW_PORT || 5001);
app.listen(port, '127.0.0.1', () => {
  console.log(`Supabase Auth preview running at http://127.0.0.1:${port}`);
});
