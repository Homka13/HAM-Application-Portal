import { Request, Response } from 'express';
import prisma from '../config/db';
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

  const change = await prisma.changeRequest.create({
    data: {
      title,
      description,
      type,
      risk,
      scheduledAt,
      requestedBy: requestedBy || 'System',
    },
  });
  res.status(201).json(change);
};

export const getChanges = async (_req: Request, res: Response): Promise<void> => {
  const changes = await prisma.changeRequest.findMany({
    orderBy: { scheduledAt: 'asc' },
    include: { applications: true },
  });
  res.status(200).json(changes);
};

export const updateChangeStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status, approvedBy } = req.body;

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.changeRequest.findUnique({ where: { id } });

    if (!current) {
      throw new NotFoundError('Change request not found');
    }

    const allowedStatuses = CHANGE_WORKFLOW[current.status] || [];
    if (!allowedStatuses.includes(status)) {
      throw new ValidationError(`Недопустимий перехід: ${current.status} → ${status}`);
    }

    const data: any = { status };
    if (status === 'APPROVED') {
      data.approvedBy = approvedBy || 'System';
    }

    return tx.changeRequest.update({ where: { id }, data });
  });

  res.status(200).json(result);
};

export const linkApplication = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { applicationId } = req.body;

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { changeRequestId: id },
  });
  res.status(200).json(updated);
};
