/**
 * @file src/lib/clickup.ts
 * @module lib/clickup
 * @description Bidirectional ClickUp integration with fail-closed HMAC-SHA256 verification.
 *
 * Architectural Role:
 * Bridges the HAM Application Portal with external ClickUp task workspaces.
 * Synchronizes application ticket creation into ClickUp tasks, propagates outbound
 * portal status transitions to ClickUp, and processes inbound ClickUp webhook event
 * notifications. Implements fail-closed cryptographic HMAC-SHA256 authentication over
 * raw payload byte buffers, multi-lingual status mapping (Ukrainian and English),
 * outbound echo caching (60s TTL), and rapid-fire deduplication (5s TTL) to prevent
 * infinite update loops between the two systems.
 *
 * Inputs:
 * - Application entities and status transition events from `appEvents`.
 * - Inbound webhook JSON payloads, signature headers, and raw Buffers from Express.
 * - Integration credentials (`CLICKUP_API_KEY`, `CLICKUP_LIST_ID`, `CLICKUP_WEBHOOK_SECRET`).
 *
 * Outputs:
 * - REST calls creating/updating ClickUp tasks via ClickUp API v2.
 * - Internal application status updates and audit logs attributed to 'ClickUp Webhook'.
 *
 * Constraints & Assumptions:
 * - `generateClickUpSignature` must remain exported and signature-compatible for security tests.
 * - Inbound webhook handling is strictly fail-closed: missing secret yields HTTP 503;
 *   missing or invalid signatures yield HTTP 401.
 * - Webhook-initiated updates assign `changedBy: 'ClickUp Webhook'` and `actorRole: 'SYSTEM_CLICKUP'`.
 */

import crypto from 'node:crypto';
import { db } from '../config/db';
import { localStore } from './storage';
import { appEvents } from '../controllers/applicationController';

/**
 * ClickUp API credentials and integration settings.
 */
export interface ClickUpConfig {
  /** Personal API token for ClickUp API v2 authentication. */
  apiKey?: string;
  /** Destination ClickUp List identifier where tasks are created. */
  listId?: string;
  /** Secret key used to sign and verify inbound webhook HMAC-SHA256 payloads. */
  webhookSecret?: string;
  /** Master toggle enabling or disabling ClickUp synchronization. */
  enabled?: boolean;
}

/**
 * Priority mapping converting portal priority strings into ClickUp numeric tiers:
 * 1: Urgent (CRITICAL), 2: High (HIGH), 3: Normal (MEDIUM), 4: Low (LOW).
 */
export const PRIORITY_MAP: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

/**
 * Translation dictionary mapping external ClickUp status labels (Ukrainian and English)
 * to internal portal lifecycle statuses across the 12-status domain model.
 */
export const CLICKUP_TO_PORTAL_STATUS: Record<string, string> = {
  // Ukrainian status synonyms.
  'нова': 'NEW',
  'новий': 'NEW',
  'підготовка тз': 'TZ_PREPARATION',
  'тз': 'TZ_PREPARATION',
  'доопрацювання': 'TZ_PREPARATION',
  'на доопрацювання': 'TZ_PREPARATION',
  'оцінка': 'ESTIMATION',
  'в роботі': 'IN_PROGRESS',
  'в процесі': 'IN_PROGRESS',
  'тестування': 'TESTING',
  'на перевірці': 'UAT',
  'перевірка': 'UAT',
  'очікує перевірку': 'UAT',
  'погоджено': 'APPROVED',
  'на погодженні': 'PENDING_APPROVAL',
  'вирішено': 'RESOLVED',
  'виконано': 'RESOLVED',
  'закрито': 'CLOSED',
  'відхилено': 'REJECTED',
  'скасовано': 'REJECTED',

  // English status synonyms.
  'new': 'NEW',
  'to do': 'NEW',
  'open': 'NEW',
  'backlog': 'NEW',
  'tz_preparation': 'TZ_PREPARATION',
  'rework': 'TZ_PREPARATION',
  'need info': 'TZ_PREPARATION',
  'reopened': 'TZ_PREPARATION',
  'estimation': 'ESTIMATION',
  'in_progress': 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  'in development': 'IN_PROGRESS',
  'wip': 'IN_PROGRESS',
  'testing': 'TESTING',
  'qa': 'TESTING',
  'uat': 'UAT',
  'in review': 'UAT',
  'review': 'UAT',
  'pending_approval': 'PENDING_APPROVAL',
  'approved': 'APPROVED',
  'resolved': 'RESOLVED',
  'done': 'RESOLVED',
  'completed': 'RESOLVED',
  'closed': 'CLOSED',
  'rejected': 'REJECTED',
  'cancelled': 'REJECTED',
};

/**
 * Translation dictionary mapping internal portal statuses to ClickUp task statuses.
 */
export const PORTAL_TO_CLICKUP_STATUS: Record<string, string> = {
  NEW: 'Open',
  TZ_PREPARATION: 'TZ Preparation',
  ESTIMATION: 'Estimation',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  TRIAGE: 'Triage',
  IN_PROGRESS: 'In Progress',
  TESTING: 'Testing',
  UAT: 'In Review',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

/**
 * Resolves active ClickUp configuration settings from environment variables.
 *
 * @returns Populated ClickUpConfig instance.
 */
export function getClickUpConfig(): ClickUpConfig {
  return {
    apiKey: process.env.CLICKUP_API_KEY,
    listId: process.env.CLICKUP_LIST_ID,
    webhookSecret: process.env.CLICKUP_WEBHOOK_SECRET,
    enabled: process.env.CLICKUP_ENABLED !== 'false',
  };
}

/**
 * Evaluates whether ClickUp integration credentials are fully configured.
 *
 * @returns True if both API key and List ID are present and integration is enabled.
 */
export function isClickUpConfigured(): boolean {
  const config = getClickUpConfig();
  return Boolean(config.apiKey && config.listId && config.enabled);
}

/**
 * Computes an HMAC-SHA256 signature string for an unmutated payload buffer or string.
 *
 * Used extensively by test suites to construct valid test authentication headers.
 *
 * @param payload - Raw buffer, string, or object to sign.
 * @param secret - Shared HMAC signing secret.
 * @returns Lowercase hexadecimal HMAC-SHA256 signature string.
 */
export function generateClickUpSignature(
  payload: any,
  secret: string,
): string {
  const payloadBytes = Buffer.isBuffer(payload)
    ? payload
    : typeof payload === 'string'
      ? payload
      : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(payloadBytes).digest('hex');
}

/**
 * Performs timing-safe HMAC-SHA256 verification of incoming webhook signatures.
 *
 * Compares raw signature buffers using `crypto.timingSafeEqual` to guard against
 * timing side-channel analysis attacks.
 *
 * @param payload - Raw payload buffer or string received over the wire.
 * @param signature - Signature hexadecimal string extracted from HTTP headers.
 * @param secret - Configured shared webhook secret.
 * @returns True if signature is valid and authentic, false otherwise.
 */
export function verifyClickUpSignature(
  payload: any,
  signature?: string | null,
  secret?: string | null,
): boolean {
  if (!signature || !secret) {
    return false;
  }

  try {
    const rawData = Buffer.isBuffer(payload)
      ? payload
      : typeof payload === 'string'
        ? payload
        : JSON.stringify(payload);
    const expectedSignatureHex = crypto
      .createHmac('sha256', secret)
      .update(rawData)
      .digest('hex');

    const incomingSignatureBuffer = Buffer.from(signature, 'hex');
    const expectedSignatureBuffer = Buffer.from(expectedSignatureHex, 'hex');

    // Length check prevents timingSafeEqual from throwing an exception.
    if (incomingSignatureBuffer.length !== expectedSignatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      incomingSignatureBuffer,
      expectedSignatureBuffer,
    );
  } catch {
    return false;
  }
}

/**
 * Formats an application entity into a structured ClickUp task payload.
 *
 * Constructs rich markdown task descriptions containing WSJF scores, form metadata,
 * and JSON parameters, and sets epoch millisecond due dates.
 *
 * @param application - Application record.
 * @returns Formatted task object matching ClickUp API v2 expectations.
 */
export function formatClickUpTaskPayload(application: any) {
  const priorityTier = PRIORITY_MAP[application.priority] ?? 3;
  const taskName = `[${application.id || 'NEW'}] ${
    application.applicantName || 'Applicant'
  }: ${
    application.description ? application.description.slice(0, 60) : 'Заявка'
  }`;

  let markdownDescription =
    `### Інформація про заявку\n` +
    `- **ID**: ${application.id || 'N/A'}\n` +
    `- **Замовник**: ${application.applicantName || 'N/A'}\n` +
    `- **Email**: ${application.requesterEmail || 'N/A'}\n` +
    `- **Тип**: ${application.type || 'SERVICE_REQUEST'} (Форма: ${
      application.formType || 'A'
    })\n` +
    `- **Підтип**: ${application.subtype || 'N/A'}\n` +
    `- **Пріоритет**: ${application.priority || 'MEDIUM'}\n` +
    `- **WSJF**: ${
      application.wsjf !== undefined && application.wsjf !== null
        ? application.wsjf
        : 'N/A'
    }\n\n` +
    `### Опис\n${application.description || 'Опис відсутній'}\n`;

  if (
    application.payload &&
    typeof application.payload === 'object' &&
    Object.keys(application.payload).length > 0
  ) {
    markdownDescription +=
      '\n### Параметри форми\n```json\n' +
      JSON.stringify(application.payload, null, 2) +
      '\n```\n';
  }

  let dueDateEpochMs: number | null = null;
  if (application.dueDate) {
    dueDateEpochMs = new Date(application.dueDate).getTime();
  } else if (application.slaDeadline) {
    dueDateEpochMs = new Date(application.slaDeadline).getTime();
  }

  return {
    name: taskName,
    description: markdownDescription,
    priority: priorityTier,
    due_date: dueDateEpochMs,
    tags: [
      application.formType
        ? `form-${application.formType.toLowerCase()}`
        : 'form-a',
      application.type
        ? application.type.toLowerCase()
        : 'service_request',
    ],
  };
}

/**
 * Translates an external ClickUp status string to internal portal status.
 *
 * @param clickupStatus - Raw status string received from ClickUp.
 * @returns Standard portal status or null if unrecognized.
 */
export function mapClickUpStatus(
  clickupStatus?: string | null,
): string | null {
  if (!clickupStatus || typeof clickupStatus !== 'string') {
    return null;
  }
  const normalizedStatus = clickupStatus.trim().toLowerCase();
  return CLICKUP_TO_PORTAL_STATUS[normalizedStatus] || null;
}

/**
 * Translates an internal portal status to the corresponding ClickUp status string.
 *
 * @param portalStatus - Internal portal status string.
 * @returns ClickUp task status string or null.
 */
export function mapPortalStatusToClickUp(
  portalStatus: string,
): string | null {
  return PORTAL_TO_CLICKUP_STATUS[portalStatus] || null;
}

/** Cache storing outbound status mutations with a 60-second time-to-live. */
const outboundEchoCache = new Map<string, number>();

/**
 * Records an outbound status synchronization to prevent echo reflection loops.
 *
 * @param taskId - ClickUp task identifier.
 * @param status - Target status sent to ClickUp.
 */
export function recordOutboundEcho(taskId: string, status: string): void {
  const cacheKey = `${taskId}:${status.toLowerCase().trim()}`;
  outboundEchoCache.set(cacheKey, Date.now() + 60000);
}

/**
 * Checks whether an incoming status change matches a recent outbound update from the portal.
 *
 * @param taskId - ClickUp task identifier.
 * @param status - Inbound status reported by webhook.
 * @returns True if the status was recently dispatched outbound from the portal.
 */
export function isRecentOutboundEcho(
  taskId: string,
  status: string,
): boolean {
  const cacheKey = `${taskId}:${status.toLowerCase().trim()}`;
  const expirationTimestamp = outboundEchoCache.get(cacheKey);
  if (!expirationTimestamp) {
    return false;
  }
  if (Date.now() > expirationTimestamp) {
    outboundEchoCache.delete(cacheKey);
    return false;
  }
  return true;
}

/** Cache recording inbound webhook event timestamps with a 5-second sliding window. */
const recentWebhookEvents = new Map<string, number>();

/**
 * Evaluates whether an incoming webhook event is an unneeded duplicate within 5 seconds.
 *
 * @param taskId - ClickUp task identifier.
 * @param status - Target status indicated in the webhook.
 * @param currentTimestamp - Current wall-clock timestamp (defaults to Date.now()).
 * @returns Object with boolean `duplicate` property.
 */
export function processWebhookWithDedup(
  taskId: string,
  status: string,
  currentTimestamp: number = Date.now(),
): { duplicate: boolean } {
  const cacheKey = `${taskId}:${status.toLowerCase().trim()}`;
  const lastObservedTimestamp = recentWebhookEvents.get(cacheKey);

  if (
    lastObservedTimestamp &&
    currentTimestamp - lastObservedTimestamp < 5000
  ) {
    return { duplicate: true };
  }

  recentWebhookEvents.set(cacheKey, currentTimestamp);
  return { duplicate: false };
}

/**
 * Creates a linked ClickUp task for an application in the configured ClickUp List.
 *
 * @param application - Target application entity.
 * @returns A Promise resolving to the ClickUp task ID or null on failure.
 */
export async function createClickUpTask(
  application: any,
): Promise<string | null> {
  const { apiKey, listId } = getClickUpConfig();
  if (!apiKey || !listId) {
    console.warn('[ClickUp] Integration unconfigured. Skipping task creation.');
    return null;
  }

  const taskPayload = formatClickUpTaskPayload(application);
  const taskEndpointUrl = `https://api.clickup.com/api/v2/list/${listId}/task`;

  try {
    const apiResponse = await fetch(taskEndpointUrl, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskPayload),
    });

    if (!apiResponse.ok) {
      console.warn(
        `[ClickUp API Error] HTTP ${apiResponse.status}: ${apiResponse.statusText}`,
      );
      return null;
    }

    const responseJson: any = await apiResponse.json();
    const createdTaskId = responseJson?.id || null;

    if (createdTaskId && application.id) {
      try {
        await db.orm.public.Application
          .where({ id: application.id })
          .update({ clickupTaskId: createdTaskId });
        await db.orm.public.AuditLog.create({
          applicationId: application.id,
          field: 'CLICKUP_TASK_ID',
          oldValue: null,
          newValue: createdTaskId,
          changedBy: 'ClickUp Integration',
        });
      } catch {
        localStore.updateApplication(application.id, {
          clickupTaskId: createdTaskId,
        });
        localStore.createAuditLog({
          applicationId: application.id,
          field: 'CLICKUP_TASK_ID',
          oldValue: null,
          newValue: createdTaskId,
          changedBy: 'ClickUp Integration',
        });
      }
      application.clickupTaskId = createdTaskId;
    }

    return createdTaskId;
  } catch (error) {
    console.error('[ClickUp Network Error]', error);
    return null;
  }
}

/**
 * Updates the status of an existing ClickUp task.
 *
 * Records an outbound echo key prior to dispatching to suppress echo loops.
 *
 * @param taskId - ClickUp task identifier.
 * @param portalOrClickUpStatus - Internal portal status or ClickUp status string.
 * @returns A Promise resolving to true if update succeeded, false otherwise.
 */
export async function updateClickUpTaskStatus(
  taskId: string,
  portalOrClickUpStatus: string,
): Promise<boolean> {
  const { apiKey } = getClickUpConfig();
  if (!apiKey || !taskId) {
    console.warn('[ClickUp] Missing apiKey or taskId. Skipping status update.');
    return false;
  }

  const targetClickUpStatus =
    PORTAL_TO_CLICKUP_STATUS[portalOrClickUpStatus] || portalOrClickUpStatus;
  const updateEndpointUrl = `https://api.clickup.com/api/v2/task/${taskId}`;

  // Record echo expectation prior to network call.
  recordOutboundEcho(taskId, targetClickUpStatus);

  try {
    const apiResponse = await fetch(updateEndpointUrl, {
      method: 'PUT',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: targetClickUpStatus }),
    });

    if (!apiResponse.ok) {
      console.warn(
        `[ClickUp API Error] HTTP ${apiResponse.status}: ${apiResponse.statusText}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('[ClickUp Network Error]', error);
    return false;
  }
}

/**
 * Locates an application record associated with a specific ClickUp task identifier.
 *
 * Queries PostgreSQL with fallback to `localStore`.
 *
 * @param taskId - ClickUp task identifier.
 * @returns A Promise resolving to the matched Application entity or null.
 */
export async function findApplicationByClickUpTaskId(
  taskId: string,
): Promise<any | null> {
  try {
    const databaseApp = await db.orm.public.Application
      .where({ clickupTaskId: taskId })
      .first();
    if (databaseApp) {
      return databaseApp;
    }
  } catch {
    // Proceed to localStore fallback if database query fails.
  }
  const applications = localStore.getApplications();
  return (
    applications.find(
      (application) => application.clickupTaskId === taskId,
    ) || null
  );
}

/**
 * Standard response contract returned by webhook processing functions.
 */
export interface WebhookResult {
  /** HTTP status code suitable for the webhook acknowledgement response. */
  statusCode: number;
  /** Whether the webhook was processed successfully. */
  success: boolean;
  /** Optional diagnostic or outcome description. */
  message?: string;
  /** Optional error message if verification or update failed. */
  error?: string;
  /** The updated application record if a mutation occurred. */
  application?: any;
}

/**
 * Processes an inbound ClickUp webhook event through fail-closed verification guards.
 *
 * Sequence of Execution:
 * 1. Fail-closed secret verification: Returns 503 if secret is unconfigured.
 * 2. Missing signature check: Returns 401 if signature header is missing.
 * 3. Timing-safe HMAC verification: Returns 401 if signature fails comparison.
 * 4. Payload structure validation: Ensures `task_id` is present.
 * 5. Status mapping: Translates ClickUp status to portal 12-status equivalent.
 * 6. Outbound echo suppression: Ignores webhooks originating from recent portal updates.
 * 7. Entity resolution: Locates the matching Application record.
 * 8. Idempotency guard: Returns 200 immediately if status already matches.
 * 9. Deduplication check: Suppresses duplicate webhooks within 5 seconds.
 * 10. Database mutation & event emission: Commits status and audit log, then emits events.
 *
 * @param payload - Parsed JSON webhook payload body.
 * @param signature - Incoming HMAC signature header.
 * @param rawBody - Unparsed raw body Buffer from Express parser.
 * @returns A Promise resolving to the structured WebhookResult.
 */
export async function handleInboundClickUpWebhook(
  payload: any,
  signature?: string | null,
  rawBody?: string | Buffer,
): Promise<WebhookResult> {
  const { webhookSecret } = getClickUpConfig();
  const configuredSecret = webhookSecret ? webhookSecret.trim() : '';

  // 1. Signature Verification (Fail-Closed Security Posture).
  if (!configuredSecret) {
    return {
      statusCode: 503,
      success: false,
      error: 'CLICKUP_WEBHOOK_SECRET is not configured',
    };
  }

  if (!signature) {
    return {
      statusCode: 401,
      success: false,
      error: 'Missing signature header',
    };
  }

  const payloadToVerify = rawBody !== undefined ? rawBody : payload;
  const isSignatureValid = verifyClickUpSignature(
    payloadToVerify,
    signature,
    configuredSecret,
  );

  if (!isSignatureValid) {
    return {
      statusCode: 401,
      success: false,
      error: 'Invalid HMAC signature',
    };
  }

  let parsedPayloadData: any = payload;
  if (parsedPayloadData === undefined || parsedPayloadData === null) {
    if (rawBody !== undefined && rawBody !== null) {
      const rawString = Buffer.isBuffer(rawBody)
        ? rawBody.toString('utf8')
        : String(rawBody);
      try {
        parsedPayloadData = JSON.parse(rawString);
      } catch {
        return {
          statusCode: 400,
          success: false,
          error: 'Invalid JSON payload',
        };
      }
    }
  } else if (typeof parsedPayloadData === 'string') {
    try {
      parsedPayloadData = JSON.parse(parsedPayloadData);
    } catch {
      return {
        statusCode: 400,
        success: false,
        error: 'Invalid JSON payload',
      };
    }
  } else if (Buffer.isBuffer(parsedPayloadData)) {
    try {
      parsedPayloadData = JSON.parse(parsedPayloadData.toString('utf8'));
    } catch {
      return {
        statusCode: 400,
        success: false,
        error: 'Invalid JSON payload',
      };
    }
  }

  // 2. Validate payload schema structure.
  if (
    !parsedPayloadData ||
    typeof parsedPayloadData !== 'object' ||
    !parsedPayloadData.task_id
  ) {
    return {
      statusCode: 400,
      success: false,
      error: 'Missing task_id in webhook payload',
    };
  }

  // 3. Extract status from top-level property or history_items collection.
  let reportedClickUpStatus = parsedPayloadData.status;
  if (!reportedClickUpStatus && Array.isArray(parsedPayloadData.history_items)) {
    const statusHistoryItem = parsedPayloadData.history_items.find(
      (item: any) => item.field === 'status',
    );
    if (statusHistoryItem?.after?.status) {
      reportedClickUpStatus = statusHistoryItem.after.status;
    }
  }

  if (!reportedClickUpStatus) {
    return {
      statusCode: 200,
      success: true,
      message: 'No status change in payload',
    };
  }

  // 4. Translate ClickUp status string into internal portal status.
  const targetPortalStatus = mapClickUpStatus(reportedClickUpStatus);
  if (!targetPortalStatus) {
    return {
      statusCode: 200,
      success: true,
      message: `Ignored unmapped ClickUp status: ${reportedClickUpStatus}`,
    };
  }

  // 5. Suppress outbound echo reflection loops.
  if (
    isRecentOutboundEcho(
      parsedPayloadData.task_id,
      reportedClickUpStatus,
    )
  ) {
    return {
      statusCode: 200,
      success: true,
      message: 'Status update originated from portal (echo ignored)',
    };
  }

  // 6. Find target application entity linked to this ClickUp task ID.
  const targetApplication = await findApplicationByClickUpTaskId(
    parsedPayloadData.task_id,
  );
  if (!targetApplication) {
    return {
      statusCode: 404,
      success: false,
      error: `Application not found for ClickUp task ${parsedPayloadData.task_id}`,
    };
  }

  // 7. Idempotency check: If ticket already has target status, return 200 cleanly.
  if (targetApplication.status === targetPortalStatus) {
    return {
      statusCode: 200,
      success: true,
      message: 'Status already up to date (idempotent no-op)',
    };
  }

  // 8. Deduplication check: Suppress identical rapid-fire delivery attempts.
  const deduplicationResult = processWebhookWithDedup(
    parsedPayloadData.task_id,
    targetPortalStatus,
  );
  if (deduplicationResult.duplicate) {
    return {
      statusCode: 200,
      success: true,
      message: 'Duplicate webhook event suppressed',
    };
  }

  // 9. Commit status update to database or localStore, then broadcast domain event.
  try {
    let updatedApplicationRecord: any;
    try {
      updatedApplicationRecord = await db.transaction(
        async (transaction) => {
          const applicationRecord = await transaction.orm.public.Application
            .where({ id: targetApplication.id })
            .update({ status: targetPortalStatus });

          await transaction.orm.public.AuditLog.create({
            applicationId: targetApplication.id,
            field: 'STATUS',
            oldValue: targetApplication.status,
            newValue: targetPortalStatus,
            changedBy: 'ClickUp Webhook',
          });

          return applicationRecord;
        },
      );
    } catch {
      updatedApplicationRecord = localStore.updateApplication(
        targetApplication.id,
        { status: targetPortalStatus },
      );
      localStore.createAuditLog({
        applicationId: targetApplication.id,
        field: 'STATUS',
        oldValue: targetApplication.status,
        newValue: targetPortalStatus,
        changedBy: 'ClickUp Webhook',
      });
    }

    try {
      appEvents.emit('application:status_changed', {
        app: updatedApplicationRecord,
        from: targetApplication.status,
        to: targetPortalStatus,
        actorRole: 'SYSTEM_CLICKUP',
        changedBy: 'ClickUp Webhook',
        timestamp: new Date().toISOString(),
      });
      appEvents.emit('statusTransition', {
        app: updatedApplicationRecord,
        from: targetApplication.status,
        to: targetPortalStatus,
        actorRole: 'SYSTEM_CLICKUP',
        changedBy: 'ClickUp Webhook',
        timestamp: new Date().toISOString(),
      });
    } catch (emissionError) {
      console.error('[appEvents emit error]', emissionError);
    }

    return {
      statusCode: 200,
      success: true,
      application: updatedApplicationRecord,
    };
  } catch (updateError: any) {
    return {
      statusCode: 400,
      success: false,
      error: updateError?.message || 'Failed to update application status',
    };
  }
}

/**
 * Handles outbound status change events and synchronizes them to ClickUp.
 *
 * Suppresses outbound dispatches when the change originated from ClickUp itself.
 *
 * @param event - Status transition metadata.
 * @returns A Promise resolving when ClickUp update completes.
 */
export async function handleClickUpStatusChange(event: {
  app: any;
  from: string | null;
  to: string;
  actorRole?: string;
  changedBy?: string;
}): Promise<void> {
  // Loop suppression: Skip outbound sync if the status change was caused by a ClickUp webhook.
  if (
    event.changedBy === 'ClickUp Webhook' ||
    event.actorRole === 'SYSTEM_CLICKUP'
  ) {
    return;
  }

  const application = event.app;
  if (!application) {
    return;
  }

  // If no task exists yet in ClickUp, auto-create one upon entering IN_PROGRESS or APPROVED.
  if (!application.clickupTaskId) {
    const isCreationTrigger =
      event.to === 'IN_PROGRESS' || event.to === 'APPROVED';

    if (isCreationTrigger) {
      await createClickUpTask(application);
    }
  } else {
    // If task already exists, propagate the new status.
    const clickUpStatus = mapPortalStatusToClickUp(event.to);
    if (clickUpStatus) {
      await updateClickUpTaskStatus(application.clickupTaskId, clickUpStatus);
    }
  }
};

/** Guard ensuring integration listener is bound once. */
let isClickUpInitialized = false;

/**
 * Binds outbound status transition listener to `appEvents`.
 */
export function initClickUpIntegration(): void {
  if (isClickUpInitialized) {
    return;
  }
  isClickUpInitialized = true;

  appEvents.on('application:status_changed', (eventPayload: any) => {
    handleClickUpStatusChange(eventPayload).catch((error) => {
      console.error('[ClickUp Status Change Error]', error);
    });
  });
}
