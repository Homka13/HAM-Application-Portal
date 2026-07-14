import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import applicationRoutes from './routes/applicationRoutes';
import serviceCatalogRoutes from './routes/serviceCatalogRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/api/applications', applicationRoutes);
app.use('/api/services', serviceCatalogRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

