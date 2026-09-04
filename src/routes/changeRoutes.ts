/**
 * @file src/routes/changeRoutes.ts
 * @module routes/changeRoutes
 * @description REST API routing declarations for ITIL Change Management.
 *
 * Architectural Role:
 * Maps HTTP endpoints targeting `/api/changes` to the change controller.
 * Enforces administrative role authorization for creating changes, mutating
 * lifecycle statuses, and linking related applications.
 *
 * Inputs:
 * - HTTP POST, GET, and PATCH requests targeting `/api/changes`.
 *
 * Outputs:
 * - Express Router instance configured with validation and authorization guards.
 *
 * Constraints & Assumptions:
 * - Mutative operations (POST, PATCH) mandate ADMIN role permissions.
 */

import { Router } from 'express';
import {
  createChange,
  getChanges,
  updateChangeStatus,
  linkApplication,
} from '../controllers/changeController';
import { authorizeRole } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import {
  createChangeBody,
  updateChangeStatusBody,
  linkApplicationBody,
  idParamSchema,
} from '../validation/schemas';

const router = Router();

// Create a new Change Request (Restricted to ADMIN).
router.post(
  '/',
  authorizeRole('ADMIN'),
  validate({ body: createChangeBody }),
  createChange,
);

// Retrieve all Change Requests ordered by scheduled deployment window.
router.get('/', getChanges);

// Update status of a Change Request (Restricted to ADMIN).
router.patch(
  '/:id/status',
  authorizeRole('ADMIN'),
  validate({
    params: idParamSchema,
    body: updateChangeStatusBody,
  }),
  updateChangeStatus,
);

// Link an application ticket to a Change Request (Restricted to ADMIN).
router.patch(
  '/:id/link',
  authorizeRole('ADMIN'),
  validate({
    params: idParamSchema,
    body: linkApplicationBody,
  }),
  linkApplication,
);

export default router;
