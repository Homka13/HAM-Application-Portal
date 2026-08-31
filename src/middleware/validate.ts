import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export const validate = (schemas: ValidationSchemas) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        next(result.error);
        return;
      }
      req.params = result.data as Record<string, string>;
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        next(result.error);
        return;
      }
      // Express 5 exposes `req.query` as a read-only getter that re-parses the
      // query string on each access, so it cannot be reassigned. Replace the
      // getter with one returning the validated object instead.
      const validatedQuery = result.data;
      Object.defineProperty(req, 'query', {
        configurable: true,
        enumerable: true,
        get: () => validatedQuery,
      });
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        next(result.error);
        return;
      }
      req.body = result.data as any;
    }

    next();
  };
};
