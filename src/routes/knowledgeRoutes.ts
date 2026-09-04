/**
 * @file src/routes/knowledgeRoutes.ts
 * @module routes/knowledgeRoutes
 * @description REST API routing declarations for ITIL Knowledge Base articles.
 *
 * Architectural Role:
 * Maps HTTP endpoints targeting `/api/kb` to knowledge base controller methods.
 * Exposes full-text article search and status-filtered listing to users, while
 * guarding article creation, editing, and publishing operations with ADMIN role checks.
 *
 * Inputs:
 * - HTTP GET, POST, and PATCH requests to `/api/kb`.
 *
 * Outputs:
 * - Express Router instance configured with validation and authorization guards.
 *
 * Constraints & Assumptions:
 * - Search and listing routes are public; modifications require ADMIN privileges.
 */

import { Router } from 'express';
import {
  createArticle,
  getArticles,
  updateArticle,
  updateArticleStatus,
  searchArticles,
} from '../controllers/knowledgeController';
import { authorizeRole } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import {
  createArticleBody,
  updateArticleBody,
  updateArticleStatusBody,
  getArticlesQuery,
  searchArticlesQuery,
  idParamSchema,
} from '../validation/schemas';

const router = Router();

// Search published Knowledge Base articles by keyword.
router.get(
  '/search',
  validate({ query: searchArticlesQuery }),
  searchArticles,
);

// Retrieve all Knowledge Base articles, optionally filtered by status query.
router.get(
  '/',
  validate({ query: getArticlesQuery }),
  getArticles,
);

// Create a new Knowledge Base article (Restricted to ADMIN).
router.post(
  '/',
  authorizeRole('ADMIN'),
  validate({ body: createArticleBody }),
  createArticle,
);

// Update editable fields of an existing article (Restricted to ADMIN).
router.patch(
  '/:id',
  authorizeRole('ADMIN'),
  validate({
    params: idParamSchema,
    body: updateArticleBody,
  }),
  updateArticle,
);

// Update lifecycle status of an article following KB_WORKFLOW (Restricted to ADMIN).
router.patch(
  '/:id/status',
  authorizeRole('ADMIN'),
  validate({
    params: idParamSchema,
    body: updateArticleStatusBody,
  }),
  updateArticleStatus,
);

export default router;
