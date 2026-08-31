import { Router } from 'express';
import { createChange, getChanges, updateChangeStatus, linkApplication } from '../controllers/changeController';
import { authorizeRole } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createChangeBody, updateChangeStatusBody, linkApplicationBody, idParamSchema } from '../validation/schemas';

const router = Router();

router.post('/', authorizeRole('ADMIN'), validate({ body: createChangeBody }), createChange);
router.get('/', getChanges);
router.patch('/:id/status', authorizeRole('ADMIN'), validate({ params: idParamSchema, body: updateChangeStatusBody }), updateChangeStatus);
router.patch('/:id/link', authorizeRole('ADMIN'), validate({ params: idParamSchema, body: linkApplicationBody }), linkApplication);

export default router;
