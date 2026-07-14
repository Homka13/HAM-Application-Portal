import { Router } from 'express';
import { createChange, getChanges, updateChangeStatus, linkApplication } from '../controllers/changeController';
import { authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.post('/', authorizeRole('ADMIN'), createChange);
router.get('/', getChanges);
router.patch('/:id/status', authorizeRole('ADMIN'), updateChangeStatus);
router.patch('/:id/link', authorizeRole('ADMIN'), linkApplication);

export default router;
