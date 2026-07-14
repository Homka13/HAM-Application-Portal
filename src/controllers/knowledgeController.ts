import { Request, Response } from 'express';
import prisma from '../config/db';

const KB_WORKFLOW: Record<string, string[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['PUBLISHED'],
};

export const createArticle = async (req: Request, res: Response): Promise<void> => {
  const { title, content, category, problemId } = req.body;
  try {
    const article = await prisma.knowledgeArticle.create({
      data: { title, content, category: category || 'General', problemId },
    });
    res.status(201).json(article);
  } catch (error) {
    console.error('Failed to create article:', error);
    res.status(500).json({ error: 'Failed to create knowledge article' });
  }
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
  try {
    const article = await prisma.knowledgeArticle.update({
      where: { id },
      data: { title, content, category },
    });
    res.status(200).json(article);
  } catch (error) {
    console.error('Failed to update article:', error);
    res.status(404).json({ error: 'Article not found' });
  }
};

export const updateArticleStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status } = req.body;

  try {
    const current = await prisma.knowledgeArticle.findUnique({ where: { id } });
    if (!current) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }

    const allowed = KB_WORKFLOW[current.status] || [];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: `Недопустимий перехід: ${current.status} → ${status}` });
      return;
    }

    const article = await prisma.knowledgeArticle.update({
      where: { id },
      data: { status },
      include: { problem: { select: { id: true, title: true } } },
    });
    res.status(200).json(article);
  } catch (error) {
    console.error('Failed to update article status:', error);
    res.status(500).json({ error: 'Failed to update article status' });
  }
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
