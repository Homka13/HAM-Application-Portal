/**
 * @file src/routes/problemRoutes.ts
 * @module routes/problemRoutes
 * @description REST API routing declarations for ITIL Problem Management.
 *
 * Architectural Role:
 * Maps HTTP requests targeting `/api/problems` to problem controller methods.
 * Enforces role authorization (ADMIN) for problem creation and status updates,
 * and validates request parameters and bodies using Zod schemas.
 *
 * Inputs:
 * - HTTP POST, GET, and PATCH requests to `/api/problems`.
 *
 * Outputs:
 * - Express Router instance with route guards and controller handlers.
 *
 * Constraints & Assumptions:
 * - Problem creation and lifecycle transitions require ADMIN privileges.
 * - Read access to problems is open to facilitate transparent incident resolution.
 */

import { Router } from 'express';
import {
  createProblem,
  getProblems,
  updateProblemStatus,
} from '../controllers/problemController';
import { authorizeRole } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import {
  createProblemBody,
  updateProblemStatusBody,
  idParamSchema,
} from '../validation/schemas';

const router = Router();

// Create a new ITIL Problem record (Restricted to ADMIN).
router.post(
  '/',
  authorizeRole('ADMIN'),
  validate({ body: createProblemBody }),
  createProblem,
);

// Retrieve all ITIL Problem records.
router.get('/', getProblems);

// Update status and root cause analysis of a Problem record (Restricted to ADMIN).
router.patch(
  '/:id/status',
  authorizeRole('ADMIN'),
  validate({
    params: idParamSchema,
    body: updateProblemStatusBody,
  }),
  updateProblemStatus,
);

export default router;
