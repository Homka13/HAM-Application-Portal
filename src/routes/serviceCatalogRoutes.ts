/**
 * @file src/routes/serviceCatalogRoutes.ts
 * @module routes/serviceCatalogRoutes
 * @description REST API routing declarations for the IT Service Catalog.
 *
 * Architectural Role:
 * Maps HTTP GET requests targeting `/api/services` to the catalog controller.
 * Exposes the list of active IT services and SLA tier metadata to the frontend.
 *
 * Inputs:
 * - HTTP GET requests to `/` (mounted at `/api/services`).
 *
 * Outputs:
 * - Express Router instance delegating to `getServiceCatalog`.
 *
 * Constraints & Assumptions:
 * - Service catalog retrieval is open and unauthenticated to allow intake form discovery.
 */

import { Router } from 'express';
import { getServiceCatalog } from '../controllers/serviceCatalogController';

const router = Router();

// Retrieve all available IT service offerings.
router.get('/', getServiceCatalog);

export default router;
