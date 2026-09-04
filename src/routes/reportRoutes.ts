/**
 * @file src/routes/reportRoutes.ts
 * @module routes/reportRoutes
 * @description REST API routing declarations for ITSM reporting and analytics.
 *
 * Architectural Role:
 * Maps HTTP GET requests targeting `/api/reports/stats` to `getStats`.
 * Serves aggregated MTTR metrics, SLA rates, and trend data to the analytical dashboard.
 *
 * Inputs:
 * - HTTP GET requests to `/stats` (mounted at `/api/reports/stats`).
 *
 * Outputs:
 * - Express Router instance delegating to `getStats`.
 *
 * Constraints & Assumptions:
 * - Statistical aggregation endpoint is open to support real-time dashboard telemetry.
 */

import { Router } from 'express';
import { getStats } from '../controllers/reportController';

const router = Router();

// Retrieve aggregated ITSM metrics and chart telemetry.
router.get('/stats', getStats);

export default router;
