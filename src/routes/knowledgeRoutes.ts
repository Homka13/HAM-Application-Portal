import { Router } from 'express';
import { createArticle, getArticles, updateArticle, updateArticleStatus, searchArticles } from '../controllers/knowledgeController';
import { authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.get('/search', searchArticles);
router.get('/', getArticles);
router.post('/', authorizeRole('ADMIN'), createArticle);
router.patch('/:id', authorizeRole('ADMIN'), updateArticle);
router.patch('/:id/status', authorizeRole('ADMIN'), updateArticleStatus);

export default router;
