import { Request, Response } from 'express';
import { db } from '../config/db';
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
  const slaDeadline = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const application = await db.orm.public.Application.create({
    applicantName,
    type,
    priority,
    description,
    slaDeadline,
    serviceCatalogId: serviceCatalogId ?? null,
  });
  res.status(201).json(application);
};

export const getApplications = async (_req: Request, res: Response): Promise<void> => {
  const applications = await db.orm.public.Application
    .orderBy((a) => a.createdAt.desc())
    .include('service')
    .all();
  res.status(200).json(applications);
};

export const getApplicationLogs = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  const logs = await db.orm.public.AuditLog
    .where({ applicationId: id })
    .orderBy((l) => l.createdAt.desc())
    .all();
  res.status(200).json(logs);
};

export const updateApplicationStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status, changedBy, resolutionNote } = req.body;

  const result = await db.transaction(async (tx) => {
    const currentApp = await tx.orm.public.Application.where({ id }).first();

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

    const updatedApp = await tx.orm.public.Application.where({ id }).update({ status });

    await tx.orm.public.AuditLog.create({
      applicationId: id,
      field: 'STATUS',
      oldValue: currentApp.status,
      newValue: status,
      changedBy: changedBy || 'System',
    });

    return updatedApp;
  });

  res.status(200).json(result);
};

export const linkProblemToApplication = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { problemId } = req.body;

  const updated = await db.orm.public.Application.where({ id }).update({ problemId });
  if (!updated) {
    throw new NotFoundError('Application not found');
  }
  res.status(200).json(updated);
};
