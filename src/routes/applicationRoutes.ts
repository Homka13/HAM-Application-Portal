import { Router } from 'express';
import { createApplication, getApplications, getApplicationLogs, updateApplicationStatus, linkProblemToApplication } from '../controllers/applicationController';
import { authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.post('/', createApplication);
router.get('/', getApplications);
router.get('/:id/logs', authorizeRole('ADMIN'), getApplicationLogs);
router.patch('/:id/status', authorizeRole('ADMIN'), updateApplicationStatus);
router.patch('/:id/link-problem', authorizeRole('ADMIN'), linkProblemToApplication);

export default router;
