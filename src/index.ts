/**
 * @file src/index.ts
 * @module index
 * @description Main application entry point and Express 5 server bootstrapper.
 *
 * Architectural Role:
 * Bootstraps the core Express 5 HTTP application for the HAM Application Portal.
 * Registers global observability instrumentation (Prometheus metrics collector,
 * request duration histograms, ticket gauge metrics), security configurations (CORS,
 * raw body preservation for HMAC verification), date normalization middleware,
 * REST API route modules, static Single Page Application (SPA) asset serving,
 * cloud readiness/liveness probes (`/health`, `/livez`, `/readyz`), and centralized
 * error handling. Bootstraps background cron schedulers and event listeners.
 *
 * Inputs:
 * - Environment variables (`PORT`, `DATABASE_URL`, `CLICKUP_*`, `SMTP_*`, `SLACK_*`).
 * - Compiled static frontend assets from `dist/public` or `frontend/dist`.
 * - Inbound HTTP client requests across all API routes.
 *
 * Outputs:
 * - Listens on configured TCP port (default 3000) for incoming HTTP traffic.
 * - Serves JSON REST APIs under `/api/*`, Prometheus telemetry on `/metrics`,
 *   and React SPA assets on root paths.
 * - Exports the Express application instance (`app`) for integration test runners.
 *
 * Constraints & Assumptions:
 * - In automated test environments (`isTest`), port listening is suppressed to allow
 *   SuperTest to bind ephemeral ports.
 * - Cloud health probes must be declared prior to the wildcard SPA fallback handler.
 * - Inbound raw body buffers must be captured in `req.rawBody` for timing-safe HMAC checks.
 */

import dotenv from 'dotenv';
dotenv.config();

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import webhookRoutes from './routes/webhookRoutes';
import { errorHandler } from './middleware/errorHandler';
import { initSlaEscalation } from './cronJobs';
import { initClickUpIntegration } from './lib/clickup';
import { initNotificationListeners } from './lib/notify';

const currentFilename = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilename);

// Optional external microservice configuration loader.
// @ts-ignore
import service from '../service.mjs';

const app = express();

// Disable X-Powered-By header to minimize information disclosure.
app.disable('x-powered-by');

/**
 * Resolves the active HTTP listening port across environment variables,
 * dynamic service configuration bindings, and local fallback defaults.
 *
 * @returns Numeric TCP port for server initialization.
 */
function getPort(): number {
  if (process.env.PORT && !Number.isNaN(Number(process.env.PORT))) {
    return Number(process.env.PORT);
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (key.includes('PORT') && value && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  try {
    const dynamicPort = (service as any)?.port?.();
    if (typeof dynamicPort === 'number') {
      return dynamicPort;
    }
  } catch {
    // Proceed to default port fallback.
  }
  return 3000;
}

const PORT = getPort();

// Global Prometheus metrics registry and default collectors (CPU, memory, event loop).
const register = new client.Registry();
client.collectDefaultMetrics({ register });

/** Tracks cumulative count of HTTP requests categorized by method, route, and status. */
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/** Tracks distribution of HTTP request processing latency in milliseconds. */
const httpRequestDurationMs = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in ms',
  labelNames: ['method', 'route'],
  registers: [register],
});

/** Tracks real-time active ITSM ticket counts grouped by lifecycle status. */
const ticketsByStatus = new client.Gauge({
  name: 'itsm_tickets_by_status',
  help: 'Number of tickets grouped by status',
  labelNames: ['status'],
  registers: [register],
});

/**
 * Regular expression matching PostgreSQL timestamptz string representations.
 * Used to normalize raw driver date representations into standard ISO-8601 strings.
 */
const PG_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?|Z)$/;

/**
 * Recursively inspects and transforms PostgreSQL timestamp values into standard
 * ISO-8601 strings to guarantee deterministic client-side JavaScript date parsing.
 *
 * @param value - Arbitrary entity, array, or scalar value.
 * @returns Normalized data structure with standardized date strings.
 */
function normalizeDates(value: unknown): unknown {
  if (typeof value === 'string') {
    if (PG_TIMESTAMP_RE.test(value)) {
      const parsedDate = new Date(value);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString();
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeDates);
  }
  if (value && typeof value === 'object') {
    const normalizedObject: Record<string, unknown> = {};
    for (const [key, propertyValue] of Object.entries(value)) {
      normalizedObject[key] = normalizeDates(propertyValue);
    }
    return normalizedObject;
  }
  return value;
}

// Request telemetry and response normalization interceptor middleware.
app.use((request, response, next) => {
  const stopLatencyTimer = httpRequestDurationMs.startTimer({
    method: request.method,
    route: request.path,
  });
  const originalJsonSerializer = response.json.bind(response);

  response.json = (responseBody: any) => {
    httpRequestsTotal.inc({
      method: request.method,
      route: request.path,
      status_code: String(response.statusCode),
    });
    stopLatencyTimer();
    return originalJsonSerializer(normalizeDates(responseBody));
  };
  next();
});

// Configure CORS and JSON body parser with raw body buffer preservation.
app.use(cors({ origin: true, credentials: true }));
app.use(
  express.json({
    verify: (request, _response, rawBuffer) => {
      // Attach the unmutated raw Buffer to enable timing-safe HMAC signature verification.
      (request as any).rawBody = rawBuffer;
    },
  }),
);

// Determine the active compiled frontend assets distribution directory.
const possibleDistPaths = [
  path.join(currentDirectory, 'public'),
  path.join(process.cwd(), 'dist/public'),
  path.join(process.cwd(), 'frontend/dist'),
  path.join(currentDirectory, '../frontend/dist'),
  path.join(currentDirectory, '../../frontend/dist'),
];
const resolvedDistPath = possibleDistPaths.find((distCandidate) =>
  fs.existsSync(distCandidate),
);

if (resolvedDistPath) {
  app.use(express.static(resolvedDistPath));
}

// Register REST API domain routes.
app.use('/api/applications', applicationRoutes);
app.use('/api/services', serviceCatalogRoutes);
app.use('/api/changes', changeRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/kb', knowledgeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/webhooks', webhookRoutes);

// Initialize asynchronous subsystem event listeners.
initClickUpIntegration();
initNotificationListeners();

/**
 * Refreshes Prometheus ticket gauge metrics by querying ticket counts by status.
 */
async function refreshTicketGauge(): Promise<void> {
  try {
    const statusCounts = await db.orm.public.Application
      .groupBy('status')
      .aggregate((aggregation: any) => ({ count: aggregation.count() }));
    ticketsByStatus.reset();
    statusCounts.forEach((statusGroup: any) =>
      ticketsByStatus.set({ status: statusGroup.status }, statusGroup.count),
    );
  } catch {
    // If database query fails, preserve existing gauge values.
  }
}

// Primary API health probe endpoint.
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', time: new Date().toISOString() });
});

// Prometheus metrics endpoint.
app.get('/metrics', async (_request, response) => {
  await refreshTicketGauge();
  response.set('Content-Type', register.contentType);
  response.end(await register.metrics());
});

// Cloud infrastructure liveness and readiness probe endpoints.
// Registered prior to the wildcard SPA fallback handler to ensure direct reachability.
app.get('/health', (_request, response) => response.json({ status: 'ok' }));
app.get('/livez', (_request, response) => response.json({ status: 'ok' }));
app.get('/readyz', (_request, response) => response.json({ status: 'ok' }));

// Root Single Page Application wildcard fallback handler.
app.use((request, response, next) => {
  // Allow unmatched /api routes and /metrics to pass to 404 or errorHandler.
  if (request.path.startsWith('/api') || request.path === '/metrics') {
    return next();
  }
  if (
    resolvedDistPath &&
    fs.existsSync(path.join(resolvedDistPath, 'index.html'))
  ) {
    return response.sendFile(path.join(resolvedDistPath, 'index.html'));
  }
  response.json({
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

// Register global terminal error handler middleware.
app.use(errorHandler);

// Global safety exception listeners to prevent silent container termination.
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

const isTestEnvironment =
  process.env.NODE_ENV === 'test' ||
  process.argv.some((argument) => argument.includes('test'));

let activeServer: any = null;

// Suppress port listening during test runner execution to avoid address-in-use conflicts.
if (!isTestEnvironment) {
  activeServer = app.listen(Number(PORT), () => {
    console.log(`Server running on port ${PORT}`);
    try {
      initSlaEscalation();
    } catch (cronError) {
      console.error('Failed to init SLA escalation:', cronError);
    }
  });

  activeServer.on('error', (serverError: any) => {
    console.error('HTTP Server Error:', serverError);
  });
}

export default app;
