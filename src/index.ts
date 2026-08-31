import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import client from 'prom-client';
import { db } from './config/db';
import applicationRoutes from './routes/applicationRoutes';
import serviceCatalogRoutes from './routes/serviceCatalogRoutes';
import changeRoutes from './routes/changeRoutes';
import problemRoutes from './routes/problemRoutes';
import knowledgeRoutes from './routes/knowledgeRoutes';
import reportRoutes from './routes/reportRoutes';
import { errorHandler } from './middleware/errorHandler';
import { initSlaEscalation } from './cronJobs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT =
  process.env.PORT ||
  process.env.COMPOSER_HAMAPPLICATIONPORTAL_PORT ||
  Object.entries(process.env).find(([k]) => k.endsWith('_PORT'))?.[1] ||
  3000;

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

// PostgreSQL `timestamptz` is returned as `YYYY-MM-DD HH:MM:SS[.ffffff]+00`;
// normalize it to ISO 8601 so browser Date parsing is reliable everywhere.
const PG_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?|Z)$/;

function normalizeDates(value: unknown): unknown {
  if (typeof value === 'string') {
    if (PG_TIMESTAMP_RE.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeDates);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = normalizeDates(entry);
    return out;
  }
  return value;
}

app.use((req, _res, next) => {
  const end = httpRequestDurationMs.startTimer({ method: req.method, route: req.path });
  const originalJson = _res.json.bind(_res);
  _res.json = (body: any) => {
    httpRequestsTotal.inc({ method: req.method, route: req.path, status_code: String(_res.statusCode) });
    end();
    return originalJson(normalizeDates(body));
  };
  next();
});

app.use(cors());
app.use(express.json());

// Determine frontend dist directory
const possibleDistPaths = [
  path.join(__dirname, 'public'),
  path.join(process.cwd(), 'dist/public'),
  path.join(process.cwd(), 'frontend/dist'),
  path.join(__dirname, '../frontend/dist'),
  path.join(__dirname, '../../frontend/dist'),
];
const distPath = possibleDistPaths.find((p) => fs.existsSync(p));

if (distPath) {
  app.use(express.static(distPath));
}

app.use('/api/applications', applicationRoutes);
app.use('/api/services', serviceCatalogRoutes);
app.use('/api/changes', changeRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/kb', knowledgeRoutes);
app.use('/api/reports', reportRoutes);

async function refreshTicketGauge() {
  try {
    const counts = await db.orm.public.Application
      .groupBy('status')
      .aggregate((agg: any) => ({ count: agg.count() }));
    ticketsByStatus.reset();
    counts.forEach((c: any) => ticketsByStatus.set({ status: c.status }, c.count));
  } catch {}
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/metrics', async (_req, res) => {
  await refreshTicketGauge();
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Root & SPA fallback handler
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/metrics') {
    return next();
  }
  if (distPath && fs.existsSync(path.join(distPath, 'index.html'))) {
    return res.sendFile(path.join(distPath, 'index.html'));
  }
  res.json({
    name: 'HAM Application Portal API',
    status: 'online',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      applications: '/api/applications',
      services: '/api/services',
      changes: '/api/changes',
      problems: '/api/problems',
      kb: '/api/kb',
      reports: '/api/reports',
      metrics: '/metrics',
    },
  });
});

app.use(errorHandler);

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  try {
    initSlaEscalation();
  } catch (err) {
    console.error('Failed to init SLA escalation:', err);
  }
});


