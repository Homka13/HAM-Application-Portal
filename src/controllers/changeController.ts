import { Request, Response } from 'express';
import prisma from '../config/db';

const CHANGE_WORKFLOW: Record<string, string[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['IMPLEMENTED'],
  IMPLEMENTED: [],
  REJECTED: [],
};

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const createChange = async (req: Request, res: Response): Promise<void> => {
  const { title, description, type, risk, scheduledAt, requestedBy } = req.body;
  try {
    const change = await prisma.changeRequest.create({
      data: {
        title,
        description,
        type: type || 'NORMAL',
        risk: risk || 'MEDIUM',
        scheduledAt: new Date(scheduledAt),
        requestedBy: requestedBy || 'System',
      },
    });
    res.status(201).json(change);
  } catch (error) {
    console.error('Failed to create change:', error);
    res.status(500).json({ error: 'Failed to create change request' });
  }
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

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.changeRequest.findUnique({ where: { id } });

      if (!current) {
        throw new Error('Change request not found');
      }

      const allowedStatuses = CHANGE_WORKFLOW[current.status] || [];
      if (!allowedStatuses.includes(status)) {
        throw new ValidationError(
          `Недопустимий перехід: ${current.status} → ${status}`
        );
      }

      const data: any = { status };
      if (status === 'APPROVED') {
        data.approvedBy = approvedBy || 'System';
      }

      return tx.changeRequest.update({ where: { id }, data });
    });

    res.status(200).json(result);
  } catch (error: any) {
    if (error.message === 'Change request not found') {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Failed to update change status:', error);
    res.status(500).json({ error: 'Failed to update change request status' });
  }
};

export const linkApplication = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { applicationId } = req.body;

  try {
    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { changeRequestId: id },
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Failed to link application:', error);
    res.status(500).json({ error: 'Failed to link application to change request' });
  }
};
