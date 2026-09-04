/**
 * @file src/middleware/errorHandler.ts
 * @module middleware/errorHandler
 * @description Centralized Express error handler and exception normalizer.
 *
 * Architectural Role:
 * Intercepts all operational and unhandled exceptions propagating from Express
 * route handlers and middleware. Maps diverse error types (Zod validation schemas,
 * domain `AppError` hierarchy, PostgreSQL relational constraints, and body-parser
 * syntax faults) into standardized, predictable HTTP status codes and JSON payloads.
 *
 * Inputs:
 * - `err`: The intercepted error object, which may be a ZodError, AppError,
 *   database driver error, body parser failure, or generic Error.
 * - Express `Request`, `Response`, and `NextFunction`.
 *
 * Outputs:
 * - Emits an HTTP response with an appropriate status code (400, 404, 409, 500)
 *   and structured JSON containing diagnostic messages without leaking stack traces.
 *
 * Constraints & Assumptions:
 * - Must be registered as the terminal middleware after all routes and prior
 *   to final server listen.
 * - Database constraint codes are mapped according to standard ANSI SQLSTATE conventions.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';

/**
 * Global Express error handling middleware function.
 *
 * Evaluates error types in priority order:
 * 1. Zod schema validation errors -> HTTP 400 with path-level details.
 * 2. Domain AppError instances -> mapped directly to their configured statusCode.
 * 3. PostgreSQL SQLSTATE 23505 (unique violation) -> HTTP 409 Conflict.
 * 4. PostgreSQL SQLSTATE 23503 (foreign key violation) -> HTTP 409 Conflict.
 * 5. Body parser JSON syntax errors -> HTTP 400 Bad Request.
 * 6. Generic operational status errors -> status preserved or 500 fallback.
 *
 * @param error - The intercepted exception or rejection.
 * @param _request - Incoming Express request context.
 * @param response - Outgoing Express response object.
 * @param _next - Express next function (unused as this is a terminal handler).
 */
export const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void => {
  // Handle Zod schema validation errors with field-level path and message reporting.
  if (error instanceof ZodError) {
    response.status(400).json({
      error: 'Validation failed',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // Handle explicit domain errors that carry configured HTTP status codes.
  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  // Handle PostgreSQL unique constraint violations (SQLSTATE 23505) and foreign key
  // integrity violations (SQLSTATE 23503) from the database runtime.
  const databaseError = error as { code?: string; sqlState?: string };
  if (databaseError.sqlState === '23505' || databaseError.code === '23505') {
    response.status(409).json({ error: 'Resource already exists' });
    return;
  }
  if (databaseError.sqlState === '23503' || databaseError.code === '23503') {
    response.status(409).json({
      error: 'Resource is referenced and cannot be modified',
    });
    return;
  }

  // Handle body parser failures when incoming JSON payload is malformed or unparseable.
  const bodyParsingError = error as { type?: string };
  if (bodyParsingError.type === 'entity.parse.failed') {
    response.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  // Handle errors bearing explicit HTTP status properties in the 4xx range.
  const statusBearingError = error as { status?: number; message?: string };
  if (
    typeof statusBearingError.status === 'number' &&
    statusBearingError.status >= 400 &&
    statusBearingError.status < 500
  ) {
    response.status(statusBearingError.status).json({
      error: statusBearingError.message || 'Bad request',
    });
    return;
  }

  // Log unhandled server errors to stderr for diagnostic analysis and return opaque 500.
  console.error('Unhandled error:', error);
  response.status(500).json({ error: 'Internal server error' });
};
