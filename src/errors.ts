/**
 * @file src/errors.ts
 * @module errors
 * @description Domain Error Hierarchy for the HAM Application Portal.
 *
 * Architectural Role:
 * Provides structured, typed exception classes used throughout controllers,
 * validation middleware, and service layers. These errors carry explicit HTTP
 * status codes and descriptive domain messages, allowing the centralized
 * error handler middleware (`src/middleware/errorHandler.ts`) to return
 * consistent JSON error responses to API clients without leaking internal traces.
 *
 * Inputs:
 * - HTTP status codes and human-readable Ukrainian or English error messages.
 *
 * Outputs:
 * - Structured error instances inheriting from standard JavaScript `Error`.
 *
 * Constraints & Assumptions:
 * - Status codes must conform to standard IANA HTTP semantics.
 * - Subclasses must maintain proper prototype chains and distinct `name` properties
 *   to support `instanceof` checks in downstream error handling middleware.
 */

/**
 * Base domain error class for all expected operational errors in the application.
 *
 * Encapsulates an HTTP status code alongside the diagnostic error message,
 * enabling uniform status code translation in the central error handling layer.
 */
export class AppError extends Error {
  /**
   * Initializes a new AppError instance.
   *
   * @param statusCode - The HTTP status code associated with this error condition.
   * @param message - Descriptive, human-readable error explanation.
   */
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Validation error indicating malformed input, failed schema validation,
 * or invalid business rule transitions.
 *
 * Automatically assigns HTTP 400 (Bad Request).
 */
export class ValidationError extends AppError {
  /**
   * Initializes a new ValidationError instance.
   *
   * @param message - Description of the specific validation failure or rule violation.
   */
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

/**
 * Not found error indicating that a requested resource (application, change request,
 * problem ticket, or knowledge base article) does not exist in persistence.
 *
 * Automatically assigns HTTP 404 (Not Found).
 */
export class NotFoundError extends AppError {
  /**
   * Initializes a new NotFoundError instance.
   *
   * @param message - Description of the missing resource identifier or lookup criteria.
   */
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}
