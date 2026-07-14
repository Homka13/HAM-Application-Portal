import { Request, Response } from 'express';
import prisma from '../config/db';

const SLA_HOURS: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72,
};

export const createApplication = async (req: Request, res: Response): Promise<void> => {
  const { applicantName, type, priority, description } = req.body;
  const hours = SLA_HOURS[priority] ?? 72;
  const slaDeadline = new Date(Date.now() + hours * 60 * 60 * 1000);
  const application = await prisma.application.create({
    data: { applicantName, type, priority, description, slaDeadline },
  });
  res.status(201).json(application);
};

export const getApplications = async (_req: Request, res: Response): Promise<void> => {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.status(200).json(applications);
};

export const updateApplicationStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status, changedBy } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const currentApp = await tx.application.findUnique({ where: { id } });

      if (!currentApp) {
        throw new Error('Application not found');
      }

      if (currentApp.status === status) {
        return currentApp;
      }

      const updatedApp = await tx.application.update({
        where: { id },
        data: { status },
      });

      await tx.auditLog.create({
        data: {
          applicationId: id,
          field: 'STATUS',
          oldValue: currentApp.status,
          newValue: status,
          changedBy: changedBy || 'System',
        },
      });

      return updatedApp;
    });

    res.status(200).json(result);
  } catch (error: any) {
    if (error.message === 'Application not found') {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Transaction failed:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
};
