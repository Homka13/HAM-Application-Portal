import { Router } from 'express';
import { createApplication, getApplications, getApplicationLogs, updateApplicationStatus } from '../controllers/applicationController';
import { authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.post('/', createApplication);
router.get('/', getApplications);
router.get('/:id/logs', authorizeRole('ADMIN'), getApplicationLogs);
router.patch('/:id/status', authorizeRole('ADMIN'), updateApplicationStatus);

export default router;
