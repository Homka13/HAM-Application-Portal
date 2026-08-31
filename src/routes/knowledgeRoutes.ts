import { Router } from 'express';
import { createArticle, getArticles, updateArticle, updateArticleStatus, searchArticles } from '../controllers/knowledgeController';
import { authorizeRole } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createArticleBody, updateArticleBody, updateArticleStatusBody, getArticlesQuery, searchArticlesQuery, idParamSchema } from '../validation/schemas';

const router = Router();

router.get('/search', validate({ query: searchArticlesQuery }), searchArticles);
router.get('/', validate({ query: getArticlesQuery }), getArticles);
router.post('/', authorizeRole('ADMIN'), validate({ body: createArticleBody }), createArticle);
router.patch('/:id', authorizeRole('ADMIN'), validate({ params: idParamSchema, body: updateArticleBody }), updateArticle);
router.patch('/:id/status', authorizeRole('ADMIN'), validate({ params: idParamSchema, body: updateArticleStatusBody }), updateArticleStatus);

export default router;
