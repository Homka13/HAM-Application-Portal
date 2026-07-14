import { Request, Response } from 'express';
import prisma from '../config/db';

export const createApplication = async (req: Request, res: Response): Promise<void> => {
  const { applicantName, type, priority, description } = req.body;
  const application = await prisma.application.create({
    data: { applicantName, type, priority, description },
  });
  res.status(201).json(application);
};

export const getApplications = async (_req: Request, res: Response): Promise<void> => {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.status(200).json(applications);
};
