/**
 * @file src/config/db.ts
 * @module config/db
 * @description Database connection configuration and client lifecycle manager.
 *
 * Architectural Role:
 * Initializes and exports the primary database client using `@prisma/orm-postgres`.
 * Resolves the active PostgreSQL connection URL across multiple configuration
 * tiers (standard environment variable, dynamically injected microservice loader,
 * pattern-matched environment variables, or local development defaults).
 *
 * Inputs:
 * - Environment variables: `DATABASE_URL` or any variable matching `*DB_URL*`.
 * - Optional dynamic service definition module `../../service.mjs`.
 * - Compiled contract definition `src/prisma/contract.json`.
 *
 * Outputs:
 * - `db`: Configured, type-safe Prisma Postgres client bound to `Contract` schema.
 *
 * Constraints & Assumptions:
 * - In test environments, controllers fall back to `localStore` if database
 *   connectivity is unavailable or intentionally skipped.
 * - Production deployments expect a valid PostgreSQL connection string.
 */

import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../prisma/contract.d';
import contractJson from '../prisma/contract.json' with { type: 'json' };

// Optional external microservice descriptor used in containerized environments.
// @ts-ignore
import service from '../../service.mjs';

/**
 * Resolves the PostgreSQL connection string by checking environment variables,
 * dynamic service configuration bindings, and fallback local defaults in precedence order.
 *
 * Precedence:
 * 1. Direct `DATABASE_URL` environment variable.
 * 2. Service loader metadata from `service.mjs` (if present).
 * 3. Any environment variable whose key contains `DB_URL`.
 * 4. Local development PostgreSQL fallback string.
 *
 * @returns Fully qualified PostgreSQL connection URL.
 */
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Attempt retrieval from dynamically loaded service configuration if provided.
  try {
    const loadedConfiguration = (service as any)?.load?.();
    if (loadedConfiguration?.db?.url) {
      return loadedConfiguration.db.url;
    }
  } catch {
    // Ignore dynamic service resolution errors and proceed to environment fallback.
  }

  // Scan environment variables for any matching DB_URL pattern (e.g., CLOUD_DB_URL).
  for (const [environmentKey, environmentValue] of Object.entries(process.env)) {
    if (environmentKey.includes('DB_URL') && environmentValue) {
      return environmentValue;
    }
  }

  // Default fallback for local PostgreSQL development instances.
  return 'postgresql://postgres:postgres@localhost:5432/ham';
}

/**
 * Resolved database connection URL used to bootstrap the Prisma client.
 */
const resolvedDatabaseUrl = resolveDatabaseUrl();

/**
 * Typed Prisma database client instance providing access to application models.
 */
export const db = postgres<Contract>({
  contractJson,
  url: resolvedDatabaseUrl,
});
