import { Request, Response, NextFunction } from 'express';

export const authorizeRole = (requiredRole: 'USER' | 'ADMIN') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.headers['x-user-role'] as string | undefined;

    if (userRole !== requiredRole && userRole !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      return;
    }
    next();
  };
};
