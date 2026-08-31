import { Request, Response } from 'express';
import { db } from '../config/db';
import { localStore } from '../lib/storage';

export const getServiceCatalog = async (_req: Request, res: Response): Promise<void> => {
  try {
    const services = await db.orm.public.ServiceCatalog
      .orderBy([(s) => s.category.asc(), (s) => s.name.asc()])
      .all();
    res.status(200).json(services.length > 0 ? services : localStore.getServices());
  } catch {
    const services = localStore.getServices();
    res.status(200).json(services);
  }
};
