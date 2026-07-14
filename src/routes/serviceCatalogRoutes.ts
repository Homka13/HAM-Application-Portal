import { Router } from 'express';
import { getServiceCatalog } from '../controllers/serviceCatalogController';

const router = Router();

router.get('/', getServiceCatalog);

export default router;
