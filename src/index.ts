import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import applicationRoutes from './routes/applicationRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/api/applications', applicationRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

