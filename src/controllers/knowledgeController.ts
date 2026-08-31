import { Request, Response } from 'express';
import prisma from '../config/db';
import { NotFoundError, ValidationError } from '../errors';

const KB_WORKFLOW: Record<string, string[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['PUBLISHED'],
};

export const createArticle = async (req: Request, res: Response): Promise<void> => {
  const { title, content, category, problemId } = req.body;

  const article = await prisma.knowledgeArticle.create({
    data: { title, content, category: category || 'General', problemId },
  });
  res.status(201).json(article);
};

export const getArticles = async (req: Request, res: Response): Promise<void> => {
  const { status } = req.query;
  const where: any = {};
  if (status) where.status = status;

  const articles = await prisma.knowledgeArticle.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: { problem: { select: { id: true, title: true, status: true } } },
  });
  res.status(200).json(articles);
};

export const updateArticle = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { title, content, category } = req.body;

  const article = await prisma.knowledgeArticle.update({
    where: { id },
    data: { title, content, category },
  });
  res.status(200).json(article);
};

export const updateArticleStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status } = req.body;

  const current = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!current) {
    throw new NotFoundError('Article not found');
  }

  const allowed = KB_WORKFLOW[current.status] || [];
  if (!allowed.includes(status)) {
    throw new ValidationError(`Недопустимий перехід: ${current.status} → ${status}`);
  }

  const article = await prisma.knowledgeArticle.update({
    where: { id },
    data: { status },
    include: { problem: { select: { id: true, title: true } } },
  });
  res.status(200).json(article);
};

export const searchArticles = async (req: Request, res: Response): Promise<void> => {
  const q = (req.query.q as string) || '';
  if (q.length < 2) {
    res.status(200).json([]);
    return;
  }

  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      status: 'PUBLISHED',
      OR: [
        { title: { contains: q } },
        { content: { contains: q } },
        { category: { contains: q } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { id: true, title: true, category: true },
  });
  res.status(200).json(articles);
};
