/**
 * @file src/controllers/serviceCatalogController.ts
 * @module controllers/serviceCatalogController
 * @description Service Catalog controller managing available ITSM service offerings.
 *
 * Architectural Role:
 * Exposes endpoints allowing clients to discover IT services, SLA tier
 * definitions, and operational category metadata. Services drive client intake
 * workflows and dynamic form rendering.
 *
 * Inputs:
 * - Express `Request` and `Response`.
 *
 * Outputs:
 * - Emits HTTP 200 JSON array of service catalog items sorted hierarchically
 *   by category and name.
 *
 * Constraints & Assumptions:
 * - Falls back transparently to in-memory `localStore` if database records
 *   are empty or the database connection fails.
 */

import { Request, Response } from 'express';
import { db } from '../config/db';
import { localStore } from '../lib/storage';

/**
 * Retrieves the complete catalog of active IT service offerings.
 *
 * Queries PostgreSQL via Prisma ORM, ordering by service category followed
 * by service name. If no database records exist or if database communication
 * encounters an error, falls back to the static seeded services in `localStore`.
 *
 * @param _request - Incoming Express request object (unused).
 * @param response - Outgoing Express response object emitting the service catalog.
 * @returns A Promise resolving when the HTTP response is transmitted.
 */
export const getServiceCatalog = async (
  _request: Request,
  response: Response,
): Promise<void> => {
  try {
    const services = await db.orm.public.ServiceCatalog
      .orderBy([
        (service) => service.category.asc(),
        (service) => service.name.asc(),
      ])
      .all();

    // If database table is populated, return records; otherwise fallback to local store.
    const serviceList =
      services.length > 0 ? services : localStore.getServices();
    response.status(200).json(serviceList);
  } catch {
    // Graceful degradation when running offline or during test suite execution.
    const fallbackServices = localStore.getServices();
    response.status(200).json(fallbackServices);
  }
};
