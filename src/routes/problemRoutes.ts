import { Router } from 'express';
import { createProblem, getProblems, updateProblemStatus } from '../controllers/problemController';
import { authorizeRole } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createProblemBody, updateProblemStatusBody, idParamSchema } from '../validation/schemas';

const router = Router();

router.post('/', authorizeRole('ADMIN'), validate({ body: createProblemBody }), createProblem);
router.get('/', getProblems);
router.patch('/:id/status', authorizeRole('ADMIN'), validate({ params: idParamSchema, body: updateProblemStatusBody }), updateProblemStatus);

export default router;
