import { Router } from 'express';
import { createApplication, getApplications, getApplicationLogs, updateApplicationStatus, linkProblemToApplication } from '../controllers/applicationController';
import { authorizeRole } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { createApplicationBody, updateApplicationStatusBody, linkProblemBody, idParamSchema } from '../validation/schemas';

const router = Router();

router.post('/', validate({ body: createApplicationBody }), createApplication);
router.get('/', getApplications);
router.get('/:id/logs', authorizeRole('ADMIN'), validate({ params: idParamSchema }), getApplicationLogs);
router.patch('/:id/status', authorizeRole('ADMIN'), validate({ params: idParamSchema, body: updateApplicationStatusBody }), updateApplicationStatus);
router.patch('/:id/link-problem', authorizeRole('ADMIN'), validate({ params: idParamSchema, body: linkProblemBody }), linkProblemToApplication);

export default router;
