import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  const prismaError = err as { code?: string };
  if (prismaError.code === 'P2025') {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }
  if (prismaError.code === 'P2002') {
    res.status(409).json({ error: 'Resource already exists' });
    return;
  }

  const bodyError = err as { type?: string };
  if (bodyError.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const statusError = err as { status?: number; message?: string };
  if (typeof statusError.status === 'number' && statusError.status >= 400 && statusError.status < 500) {
    res.status(statusError.status).json({ error: statusError.message || 'Bad request' });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
};
