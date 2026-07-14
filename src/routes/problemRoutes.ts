import { Router } from 'express';
import { createProblem, getProblems, updateProblemStatus } from '../controllers/problemController';
import { authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.post('/', authorizeRole('ADMIN'), createProblem);
router.get('/', getProblems);
router.patch('/:id/status', authorizeRole('ADMIN'), updateProblemStatus);

export default router;
