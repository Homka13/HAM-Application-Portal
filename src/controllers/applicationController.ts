import { Request, Response } from 'express';
import { db } from '../config/db';
import { NotFoundError, ValidationError } from '../errors';
import { localStore } from '../lib/storage';

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

  try {
    const application = await db.orm.public.Application.create({
      applicantName,
      type,
      priority,
      description,
      slaDeadline,
      serviceCatalogId: serviceCatalogId ?? null,
    });
    res.status(201).json(application);
  } catch {
    const application = localStore.createApplication({
      applicantName,
      type,
      priority,
      description,
      slaDeadline,
      serviceCatalogId,
    });
    res.status(201).json(application);
  }
};

export const getApplications = async (_req: Request, res: Response): Promise<void> => {
  try {
    const applications = await db.orm.public.Application
      .orderBy((a) => a.createdAt.desc())
      .include('service')
      .all();
    res.status(200).json(applications);
  } catch {
    const applications = localStore.getApplications();
    res.status(200).json(applications);
  }
};

export const getApplicationLogs = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  try {
    const logs = await db.orm.public.AuditLog
      .where({ applicationId: id })
      .orderBy((l) => l.createdAt.desc())
      .all();
    res.status(200).json(logs);
  } catch {
    const logs = localStore.getAuditLogs(id);
    res.status(200).json(logs);
  }
};

export const updateApplicationStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status, changedBy, resolutionNote } = req.body;

  try {
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
  } catch (err: any) {
    if (err instanceof NotFoundError || err instanceof ValidationError) {
      throw err;
    }

    const currentApp = localStore.getApplication(id);
    if (!currentApp) {
      throw new NotFoundError('Application not found');
    }

    if (currentApp.status === status) {
      res.status(200).json(currentApp);
      return;
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

    const updatedApp = localStore.updateApplication(id, { status });
    localStore.createAuditLog({
      applicationId: id,
      field: 'STATUS',
      oldValue: currentApp.status,
      newValue: status,
      changedBy: changedBy || 'System',
    });

    res.status(200).json(updatedApp);
  }
};

export const linkProblemToApplication = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { problemId } = req.body;

  try {
    const updated = await db.orm.public.Application.where({ id }).update({ problemId });
    if (!updated) {
      throw new NotFoundError('Application not found');
    }
    res.status(200).json(updated);
  } catch {
    const updated = localStore.updateApplication(id, { problemId });
    if (!updated) {
      throw new NotFoundError('Application not found');
    }
    res.status(200).json(updated);
  }
};
