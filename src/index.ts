import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import client from 'prom-client';
import prisma from './config/db';
import applicationRoutes from './routes/applicationRoutes';
import serviceCatalogRoutes from './routes/serviceCatalogRoutes';
import changeRoutes from './routes/changeRoutes';
import problemRoutes from './routes/problemRoutes';
import knowledgeRoutes from './routes/knowledgeRoutes';
import reportRoutes from './routes/reportRoutes';
import { errorHandler } from './middleware/errorHandler';
import { initSlaEscalation } from './cronJobs';

const app = express();
const PORT = process.env.PORT || 3000;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDurationMs = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route'],
  registers: [register],
});

const ticketsByStatus = new client.Gauge({
  name: 'itsm_tickets_by_status',
  help: 'Number of tickets grouped by status',
  labelNames: ['status'],
  registers: [register],
});

app.use((req, _res, next) => {
  const end = httpRequestDurationMs.startTimer({ method: req.method, route: req.path });
  const originalJson = _res.json.bind(_res);
  _res.json = (body: any) => {
    httpRequestsTotal.inc({ method: req.method, route: req.path, status_code: String(_res.statusCode) });
    end();
    return originalJson(body);
  };
  next();
});

app.use(cors());
app.use(express.json());
app.use('/api/applications', applicationRoutes);
app.use('/api/services', serviceCatalogRoutes);
app.use('/api/changes', changeRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/kb', knowledgeRoutes);
app.use('/api/reports', reportRoutes);

async function refreshTicketGauge() {
  try {
    const counts = await prisma.application.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    ticketsByStatus.reset();
    counts.forEach((c) => ticketsByStatus.set({ status: c.status }, c._count.status));
  } catch {}
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/metrics', async (_req, res) => {
  await refreshTicketGauge();
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initSlaEscalation();
});

