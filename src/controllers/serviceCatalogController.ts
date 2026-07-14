import { Request, Response } from 'express';
import prisma from '../config/db';

export const getServiceCatalog = async (_req: Request, res: Response): Promise<void> => {
  const services = await prisma.serviceCatalog.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  res.status(200).json(services);
};
