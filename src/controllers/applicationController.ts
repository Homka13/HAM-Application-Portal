import { Request, Response } from 'express';
import prisma from '../config/db';
import { NotFoundError, ValidationError } from '../errors';

const SLA_HOURS: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72,
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  NEW: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

export const createApplication = async (req: Request, res: Response): Promise<void> => {
  const { applicantName, type, priority, description, serviceCatalogId } = req.body;
  const hours = SLA_HOURS[priority] ?? 72;
  const slaDeadline = new Date(Date.now() + hours * 60 * 60 * 1000);

  const application = await prisma.application.create({
    data: { applicantName, type, priority, description, slaDeadline, serviceCatalogId },
  });
  res.status(201).json(application);
};

export const getApplications = async (_req: Request, res: Response): Promise<void> => {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: 'desc' },
    include: { service: true },
  });
  res.status(200).json(applications);
};

export const getApplicationLogs = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  const logs = await prisma.auditLog.findMany({
    where: { applicationId: id },
    orderBy: { createdAt: 'desc' },
  });
  res.status(200).json(logs);
};

export const updateApplicationStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status, changedBy, resolutionNote } = req.body;

  const result = await prisma.$transaction(async (tx) => {
    const currentApp = await tx.application.findUnique({ where: { id } });

    if (!currentApp) {
      throw new NotFoundError('Application not found');
    }

    if (currentApp.status === status) {
      return currentApp;
    }

    const allowedStatuses = VALID_TRANSITIONS[currentApp.status] || [];
    if (!allowedStatuses.includes(status)) {
      throw new ValidationError(`Недопустимий перехід: ${currentApp.status} → ${status}`);
    }

    if (status === 'RESOLVED' && !resolutionNote) {
      throw new ValidationError(
        'Для переведення в RESOLVED необхідно вказати опис рішення (resolutionNote)',
      );
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
};

export const linkProblemToApplication = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { problemId } = req.body;

  const updated = await prisma.application.update({
    where: { id },
    data: { problemId },
  });
  res.status(200).json(updated);
};
