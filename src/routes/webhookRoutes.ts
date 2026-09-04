/**
 * @file src/routes/webhookRoutes.ts
 * @module routes/webhookRoutes
 * @description Inbound webhook receiver for external service synchronization.
 *
 * Architectural Role:
 * Listens for inbound event notifications dispatched by ClickUp webhooks.
 * Extracts HMAC security headers (`x-signature` or `x-clickup-signature`) and
 * forwards the unparsed raw body Buffer (`req.rawBody`) to the ClickUp library
 * for timing-safe cryptographic signature verification before executing status sync.
 *
 * Inputs:
 * - Inbound HTTP POST webhooks from ClickUp servers targeting `/api/webhooks/clickup` or `/api/webhooks`.
 *
 * Outputs:
 * - Relays the synchronization outcome status code (200, 401, 404, 503) and JSON result.
 *
 * Constraints & Assumptions:
 * - Express body parser must attach the unmutated raw Buffer to `req.rawBody`.
 * - Webhook processing operates fail-closed: unverified signatures immediately yield HTTP 401/503.
 */

import { Router, Request, Response } from 'express';
import { handleInboundClickUpWebhook } from '../lib/clickup';

const router = Router();

/**
 * Common handler for processing inbound ClickUp webhook HTTP POST requests.
 *
 * Checks both `x-signature` and `x-clickup-signature` headers to support diverse
 * ClickUp webhook delivery configurations.
 *
 * @param request - Express request containing headers, parsed body, and raw body buffer.
 * @param response - Express response returning the webhook processing result.
 */
async function processClickUpWebhook(
  request: Request,
  response: Response,
): Promise<void> {
  const signatureHeader = (request.headers['x-signature'] ||
    request.headers['x-clickup-signature']) as string | undefined;
  const rawBodyBuffer = (request as any).rawBody;

  const webhookResult = await handleInboundClickUpWebhook(
    request.body,
    signatureHeader,
    rawBodyBuffer,
  );

  response.status(webhookResult.statusCode).json(webhookResult);
}

// Canonical endpoint for ClickUp webhook notifications (/api/webhooks/clickup).
router.post('/clickup', async (request: Request, response: Response): Promise<void> => {
  await processClickUpWebhook(request, response);
});

// Root fallback endpoint (/api/webhooks) supporting direct root webhook configurations.
router.post('/', async (request: Request, response: Response): Promise<void> => {
  await processClickUpWebhook(request, response);
});

export default router;
