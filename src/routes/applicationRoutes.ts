/**
 * @file src/routes/applicationRoutes.ts
 * @module routes/applicationRoutes
 * @description REST API routing declarations for ITSM applications and incident tickets.
 *
 * Architectural Role:
 * Maps HTTP requests targeting `/api/applications` to the application controller.
 * Exposes public intake endpoints (`POST /` with Zod validation), public listing
 * (`GET /`), and restricted administrative endpoints for audit logs, status
 * transitions, and problem record linkage.
 *
 * Inputs:
 * - HTTP GET, POST, and PATCH requests to `/api/applications`.
 *
 * Outputs:
 * - Express Router instance with route validation and authorization guards.
 *
 * Constraints & Assumptions:
 * - Ticket intake and listing are open to all portal users.
 * - Inspecting audit logs, mutating status, and linking problems require ADMIN authorization.
 */

import { Router } from 'express';
import {
  createApplication,
  getApplications,
  getApplicationLogs,
  updateApplicationStatus,
  linkProblemToApplication,
} from '../controllers/applicationController';
import { authorizeRole } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import {
  createApplicationBody,
  updateApplicationStatusBody,
  linkProblemBody,
  idParamSchema,
} from '../validation/schemas';

const router = Router();

// Submit a new ITSM application or incident intake request.
router.post(
  '/',
  validate({ body: createApplicationBody }),
  createApplication,
);

// Retrieve all application tickets ordered by creation date descending.
router.get('/', getApplications);

// Retrieve audit logs for a specific application ticket (Restricted to ADMIN).
router.get(
  '/:id/logs',
  authorizeRole('ADMIN'),
  validate({ params: idParamSchema }),
  getApplicationLogs,
);

// Update status of an application following branch state machines (Restricted to ADMIN).
router.patch(
  '/:id/status',
  authorizeRole('ADMIN'),
  validate({
    params: idParamSchema,
    body: updateApplicationStatusBody,
  }),
  updateApplicationStatus,
);

// Link an ITIL Problem investigation record to an application (Restricted to ADMIN).
router.patch(
  '/:id/link-problem',
  authorizeRole('ADMIN'),
  validate({
    params: idParamSchema,
    body: linkProblemBody,
  }),
  linkProblemToApplication,
);

export default router;
