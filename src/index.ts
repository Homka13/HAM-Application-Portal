import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import applicationRoutes from './routes/applicationRoutes';
import serviceCatalogRoutes from './routes/serviceCatalogRoutes';
import changeRoutes from './routes/changeRoutes';
import problemRoutes from './routes/problemRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/api/applications', applicationRoutes);
app.use('/api/services', serviceCatalogRoutes);
app.use('/api/changes', changeRoutes);
app.use('/api/problems', problemRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

