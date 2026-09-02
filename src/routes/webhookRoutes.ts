import { Router, Request, Response } from 'express';
import { handleInboundClickUpWebhook } from '../lib/clickup';

const router = Router();

router.post('/clickup', async (req: Request, res: Response): Promise<void> => {
  const signature = (req.headers['x-signature'] || req.headers['x-clickup-signature']) as string | undefined;
  const result = await handleInboundClickUpWebhook(req.body, signature);
  res.status(result.statusCode).json(result);
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const signature = (req.headers['x-signature'] || req.headers['x-clickup-signature']) as string | undefined;
  const result = await handleInboundClickUpWebhook(req.body, signature);
  res.status(result.statusCode).json(result);
});

export default router;
