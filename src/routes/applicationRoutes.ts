import { Router } from 'express';
import { createApplication, getApplications, getApplicationLogs, updateApplicationStatus } from '../controllers/applicationController';

const router = Router();

router.post('/', createApplication);
router.get('/', getApplications);
router.get('/:id/logs', getApplicationLogs);
router.patch('/:id/status', updateApplicationStatus);

export default router;
