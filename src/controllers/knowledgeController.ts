import { Request, Response } from 'express';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '../config/db';
import { NotFoundError, ValidationError } from '../errors';
import { localStore } from '../lib/storage';

const KB_WORKFLOW: Record<string, string[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['PUBLISHED'],
};

export const createArticle = async (req: Request, res: Response): Promise<void> => {
  const { title, content, category, problemId } = req.body;

  try {
    const article = await db.orm.public.KnowledgeArticle.create({
      title,
      content,
      category: category || 'General',
      problemId: problemId ?? null,
    });
    res.status(201).json(article);
  } catch {
    const article = localStore.createArticle({
      title,
      content,
      category: category || 'General',
      problemId: problemId ?? null,
    });
    res.status(201).json(article);
  }
};

export const getArticles = async (req: Request, res: Response): Promise<void> => {
  const { status } = req.query;

  try {
    const articles = await db.orm.public.KnowledgeArticle
      .where({ ...(status ? { status: status as string } : {}) })
      .orderBy((a) => a.updatedAt.desc())
      .include('problem', (p) => p.select('id', 'title', 'status'))
      .all();
    res.status(200).json(articles);
  } catch {
    const articles = localStore.getArticles(status as string | undefined);
    res.status(200).json(articles);
  }
};

export const updateArticle = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { title, content, category } = req.body;

  try {
    const article = await db.orm.public.KnowledgeArticle.where({ id }).update({
      title,
      content,
      category,
    });
    if (!article) {
      throw new NotFoundError('Article not found');
    }
    res.status(200).json(article);
  } catch (err: any) {
    if (err instanceof NotFoundError) throw err;
    const article = localStore.updateArticle(id, { title, content, category });
    if (!article) {
      throw new NotFoundError('Article not found');
    }
    res.status(200).json(article);
  }
};

export const updateArticleStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status } = req.body;

  try {
    const current = await db.orm.public.KnowledgeArticle.where({ id }).first();
    if (!current) {
      throw new NotFoundError('Article not found');
    }

    const allowed = KB_WORKFLOW[current.status] || [];
    if (!allowed.includes(status)) {
      throw new ValidationError(`Недопустимий перехід: ${current.status} → ${status}`);
    }

    const article = await db.orm.public.KnowledgeArticle
      .where({ id })
      .include('problem', (p) => p.select('id', 'title'))
      .update({ status });
    res.status(200).json(article);
  } catch (err: any) {
    if (err instanceof NotFoundError || err instanceof ValidationError) throw err;
    const current = localStore.getArticles().find((a) => a.id === id);
    if (!current) {
      throw new NotFoundError('Article not found');
    }

    const allowed = KB_WORKFLOW[current.status] || [];
    if (!allowed.includes(status)) {
      throw new ValidationError(`Недопустимий перехід: ${current.status} → ${status}`);
    }

    const article = localStore.updateArticle(id, { status });
    res.status(200).json(article);
  }
};

export const searchArticles = async (req: Request, res: Response): Promise<void> => {
  const q = (req.query.q as string) || '';
  if (q.length < 2) {
    res.status(200).json([]);
    return;
  }

  try {
    const articles = await db.orm.public.KnowledgeArticle
      .where({ status: 'PUBLISHED' })
      .where((a) =>
        or(
          a.title.like(`%${q}%`),
          a.content.like(`%${q}%`),
          a.category.like(`%${q}%`),
        ),
      )
      .orderBy((a) => a.updatedAt.desc())
      .limit(5)
      .select('id', 'title', 'category')
      .all();
    res.status(200).json(articles);
  } catch {
    const articles = localStore.searchArticles(q);
    res.status(200).json(articles);
  }
};
