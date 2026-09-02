import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helloRoute from './routes/hello';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', helloRoute);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});