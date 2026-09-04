/**
 * @file src/controllers/knowledgeController.ts
 * @module controllers/knowledgeController
 * @description ITIL Knowledge Base controller managing documentation and solution articles.
 *
 * Architectural Role:
 * Provides endpoints for creating, curating, searching, and managing the lifecycle
 * of knowledge articles. Links verified solutions to ITIL Problem records,
 * allowing engineers and requesters to resolve known issues quickly.
 *
 * Inputs:
 * - Express `Request` containing article content, categories, status transitions,
 *   and search queries.
 * - Express `Response` for transmitting JSON responses.
 *
 * Outputs:
 * - Emits HTTP 201 JSON on article creation, and HTTP 200 on search, retrieval,
 *   and state transition.
 *
 * Constraints & Assumptions:
 * - Publication workflow is strictly regulated by `KB_WORKFLOW`.
 * - Search endpoint only matches against articles with `PUBLISHED` status.
 * - Queries with fewer than two characters return an empty set immediately.
 */

import { Request, Response } from 'express';
import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '../config/db';
import { NotFoundError, ValidationError } from '../errors';
import { localStore } from '../lib/storage';

/**
 * Directed state transition graph for Knowledge Base article publishing.
 *
 * Articles begin in `DRAFT`, can be approved into `PUBLISHED`, and may be
 * retired to `ARCHIVED` (or restored from `ARCHIVED` back to `PUBLISHED`).
 */
const KB_WORKFLOW: Record<string, string[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['PUBLISHED'],
};

/**
 * Creates a new Knowledge Base article in DRAFT status.
 *
 * @param request - Express request containing `title`, `content`, `category`, and optional `problemId`.
 * @param response - Express response returning the created article with HTTP 201.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const createArticle = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { title, content, category, problemId } = request.body;

  try {
    const article = await db.orm.public.KnowledgeArticle.create({
      title,
      content,
      category: category || 'General',
      problemId: problemId ?? null,
    });
    response.status(201).json(article);
  } catch {
    const article = localStore.createArticle({
      title,
      content,
      category: category || 'General',
      problemId: problemId ?? null,
    });
    response.status(201).json(article);
  }
};

/**
 * Retrieves Knowledge Base articles, optionally filtered by status.
 *
 * Results are ordered by update timestamp descending, and include
 * linked problem summary information.
 *
 * @param request - Express request containing optional `status` query parameter.
 * @param response - Express response returning an array of matching articles.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const getArticles = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const { status } = request.query;

  try {
    const articles = await db.orm.public.KnowledgeArticle
      .where({ ...(status ? { status: status as string } : {}) })
      .orderBy((article) => article.updatedAt.desc())
      .include('problem', (problem) =>
        problem.select('id', 'title', 'status'),
      )
      .all();
    response.status(200).json(articles);
  } catch {
    const articles = localStore.getArticles(status as string | undefined);
    response.status(200).json(articles);
  }
};

/**
 * Updates editable fields (title, content, category) of an existing article.
 *
 * @param request - Express request containing article `id` parameter and updated fields.
 * @param response - Express response returning the updated article.
 * @throws {NotFoundError} If the article does not exist.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const updateArticle = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const articleId = request.params.id as string;
  const { title, content, category } = request.body;

  try {
    const updatedArticle = await db.orm.public.KnowledgeArticle
      .where({ id: articleId })
      .update({
        title,
        content,
        category,
      });

    if (!updatedArticle) {
      throw new NotFoundError('Article not found');
    }
    response.status(200).json(updatedArticle);
  } catch (caughtError: any) {
    if (caughtError instanceof NotFoundError) {
      throw caughtError;
    }

    const updatedArticle = localStore.updateArticle(articleId, {
      title,
      content,
      category,
    });

    if (!updatedArticle) {
      throw new NotFoundError('Article not found');
    }
    response.status(200).json(updatedArticle);
  }
};

/**
 * Updates the publication status of an article following `KB_WORKFLOW`.
 *
 * @param request - Express request containing article `id` parameter and target `status`.
 * @param response - Express response returning the updated article.
 * @throws {NotFoundError} If the target article record does not exist.
 * @throws {ValidationError} If the requested status change is not allowed.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const updateArticleStatus = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const articleId = request.params.id as string;
  const { status } = request.body;

  try {
    const currentArticle = await db.orm.public.KnowledgeArticle
      .where({ id: articleId })
      .first();

    if (!currentArticle) {
      throw new NotFoundError('Article not found');
    }

    const permittedStatuses = KB_WORKFLOW[currentArticle.status] || [];
    if (!permittedStatuses.includes(status)) {
      throw new ValidationError(
        `Недопустимий перехід: ${currentArticle.status} → ${status}`,
      );
    }

    const updatedArticle = await db.orm.public.KnowledgeArticle
      .where({ id: articleId })
      .include('problem', (problem) => problem.select('id', 'title'))
      .update({ status });

    response.status(200).json(updatedArticle);
  } catch (caughtError: any) {
    if (
      caughtError instanceof NotFoundError ||
      caughtError instanceof ValidationError
    ) {
      throw caughtError;
    }

    const currentArticle = localStore
      .getArticles()
      .find((article) => article.id === articleId);

    if (!currentArticle) {
      throw new NotFoundError('Article not found');
    }

    const permittedStatuses = KB_WORKFLOW[currentArticle.status] || [];
    if (!permittedStatuses.includes(status)) {
      throw new ValidationError(
        `Недопустимий перехід: ${currentArticle.status} → ${status}`,
      );
    }

    const updatedArticle = localStore.updateArticle(articleId, { status });
    response.status(200).json(updatedArticle);
  }
};

/**
 * Performs full-text keyword search across published Knowledge Base articles.
 *
 * Matches case-insensitively across article title, content, and category fields.
 *
 * @param request - Express request containing search query string `q`.
 * @param response - Express response returning up to 5 matching published articles.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const searchArticles = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const searchQuery = (request.query.q as string) || '';

  // Short queries produce excessive irrelevant results; return an empty list.
  if (searchQuery.length < 2) {
    response.status(200).json([]);
    return;
  }

  try {
    const matchingArticles = await db.orm.public.KnowledgeArticle
      .where({ status: 'PUBLISHED' })
      .where((article) =>
        or(
          article.title.like(`%${searchQuery}%`),
          article.content.like(`%${searchQuery}%`),
          article.category.like(`%${searchQuery}%`),
        ),
      )
      .orderBy((article) => article.updatedAt.desc())
      .limit(5)
      .select('id', 'title', 'category')
      .all();

    response.status(200).json(matchingArticles);
  } catch {
    const matchingArticles = localStore.searchArticles(searchQuery);
    response.status(200).json(matchingArticles);
  }
};
