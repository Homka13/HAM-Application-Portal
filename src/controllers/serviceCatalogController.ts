import { Request, Response } from 'express';
import { db } from '../config/db';

export const getServiceCatalog = async (_req: Request, res: Response): Promise<void> => {
  const services = await db.orm.public.ServiceCatalog
    .orderBy([(s) => s.category.asc(), (s) => s.name.asc()])
    .all();
  res.status(200).json(services);
};
