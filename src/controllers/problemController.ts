import { Request, Response } from 'express';
import prisma from '../config/db';
import { NotFoundError, ValidationError } from '../errors';

const PROBLEM_WORKFLOW: Record<string, string[]> = {
  NEW: ['RCA'],
  RCA: ['KNOWN_ERROR'],
  KNOWN_ERROR: ['RESOLVED'],
  RESOLVED: [],
};

export const createProblem = async (req: Request, res: Response): Promise<void> => {
  const { title, description } = req.body;

  const problem = await prisma.problem.create({
    data: { title, description },
  });
  res.status(201).json(problem);
};

export const getProblems = async (_req: Request, res: Response): Promise<void> => {
  const problems = await prisma.problem.findMany({
    orderBy: { createdAt: 'desc' },
    include: { applications: true },
  });
  res.status(200).json(problems);
};

export const updateProblemStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status, rootCause, workaround } = req.body;

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.problem.findUnique({ where: { id } });

    if (!current) {
      throw new NotFoundError('Problem record not found');
    }

    const allowedStatuses = PROBLEM_WORKFLOW[current.status] || [];
    if (!allowedStatuses.includes(status)) {
      throw new ValidationError(`Недопустимий перехід: ${current.status} → ${status}`);
    }

    const data: any = { status };
    if (rootCause) data.rootCause = rootCause;
    if (workaround) data.workaround = workaround;

    return tx.problem.update({ where: { id }, data });
  });

  res.status(200).json(result);
};
