import { Router } from 'express';
import { createApplication, getApplications, updateApplicationStatus } from '../controllers/applicationController';

const router = Router();

router.post('/', createApplication);
router.get('/', getApplications);
router.patch('/:id/status', updateApplicationStatus);

export default router;
