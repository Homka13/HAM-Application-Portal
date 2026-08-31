import { Request, Response } from 'express';
import { db } from '../config/db';
import { NotFoundError, ValidationError } from '../errors';

const CHANGE_WORKFLOW: Record<string, string[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['IMPLEMENTED'],
  IMPLEMENTED: [],
  REJECTED: [],
};

export const createChange = async (req: Request, res: Response): Promise<void> => {
  const { title, description, type, risk, scheduledAt, requestedBy } = req.body;

  const change = await db.orm.public.ChangeRequest.create({
    title,
    description,
    type,
    risk,
    scheduledAt: new Date(scheduledAt).toISOString(),
    requestedBy: requestedBy || 'System',
  });
  res.status(201).json(change);
};

export const getChanges = async (_req: Request, res: Response): Promise<void> => {
  const changes = await db.orm.public.ChangeRequest
    .orderBy((c) => c.scheduledAt.asc())
    .include('applications')
    .all();
  res.status(200).json(changes);
};

export const updateChangeStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status, approvedBy } = req.body;

  const result = await db.transaction(async (tx) => {
    const current = await tx.orm.public.ChangeRequest.where({ id }).first();

    if (!current) {
      throw new NotFoundError('Change request not found');
    }

    const allowedStatuses = CHANGE_WORKFLOW[current.status] || [];
    if (!allowedStatuses.includes(status)) {
      throw new ValidationError(`Недопустимий перехід: ${current.status} → ${status}`);
    }

    const data: { status: string; approvedBy?: string } = { status };
    if (status === 'APPROVED') {
      data.approvedBy = approvedBy || 'System';
    }

    return tx.orm.public.ChangeRequest.where({ id }).update(data);
  });

  res.status(200).json(result);
};

export const linkApplication = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { applicationId } = req.body;

  const updated = await db.orm.public.Application.where({ id: applicationId }).update({
    changeRequestId: id,
  });
  if (!updated) {
    throw new NotFoundError('Application not found');
  }
  res.status(200).json(updated);
};
