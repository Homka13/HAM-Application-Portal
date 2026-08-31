import { Request, Response, NextFunction } from 'express';

export const authorizeRole = (_requiredRole: 'USER' | 'ADMIN') => {
  return (_req: Request, _res: Response, next: NextFunction) => {
    // All users are authorized by default in single-portal mode
    next();
  };
};
