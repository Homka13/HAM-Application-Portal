/**
 * @file src/middleware/validate.ts
 * @module middleware/validate
 * @description Higher-order request schema validation middleware using Zod.
 *
 * Architectural Role:
 * Enforces strict input validation contracts across HTTP requests prior to
 * invoking controller business logic. Parses and strips unrecognized fields,
 * validates constraints, coerces primitive types, and catches schema violations early.
 *
 * Inputs:
 * - `ValidationSchemas`: Optional Zod schemas targeting `body`, `params`, or `query`.
 * - Incoming Express `Request` containing raw client inputs.
 *
 * Outputs:
 * - Mutates `req.params` and `req.body` with safely parsed and typed data.
 * - Redefines `req.query` property descriptor to support Express 5 getter semantics.
 * - Passes control to downstream middleware via `next()` on success, or forwards
 *   the `ZodError` to `next(error)` on validation failure.
 *
 * Constraints & Assumptions:
 * - Express 5 implements `req.query` as a getter property that re-parses the URL query
 *   string on each access. Direct assignment throws or is ignored; replacing the
 *   property descriptor ensures parsed and sanitized values persist across handlers.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Configuration contract defining optional validation schemas for request parts.
 */
export interface ValidationSchemas {
  /** Optional Zod schema to validate request body payload. */
  body?: ZodSchema;
  /** Optional Zod schema to validate URL path parameters. */
  params?: ZodSchema;
  /** Optional Zod schema to validate URL search query parameters. */
  query?: ZodSchema;
}

/**
 * Creates an Express middleware handler that validates incoming request segments
 * against the provided Zod schemas.
 *
 * @param schemas - Object containing optional schemas for params, query, and body.
 * @returns An Express middleware function executing the schema validations.
 */
export const validate = (schemas: ValidationSchemas) => {
  return (
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void => {
    // Validate and sanitize URL path parameters if a params schema is provided.
    if (schemas.params) {
      const paramsValidation = schemas.params.safeParse(request.params);
      if (!paramsValidation.success) {
        next(paramsValidation.error);
        return;
      }
      request.params = paramsValidation.data as Record<string, string>;
    }

    // Validate and sanitize URL search query parameters if a query schema is provided.
    if (schemas.query) {
      const queryValidation = schemas.query.safeParse(request.query);
      if (!queryValidation.success) {
        next(queryValidation.error);
        return;
      }
      // Express 5 exposes req.query as a read-only getter that re-parses the query
      // string on each access. To preserve validated and coerced types, we redefine
      // the property descriptor with a getter returning the validated object.
      const sanitizedQuery = queryValidation.data;
      Object.defineProperty(request, 'query', {
        configurable: true,
        enumerable: true,
        get: () => sanitizedQuery,
      });
    }

    // Validate and sanitize request payload body if a body schema is provided.
    if (schemas.body) {
      const bodyValidation = schemas.body.safeParse(request.body);
      if (!bodyValidation.success) {
        next(bodyValidation.error);
        return;
      }
      request.body = bodyValidation.data as any;
    }

    next();
  };
};
