import crypto from 'node:crypto';
import { db } from '../config/db';
import { localStore } from './storage';
import { appEvents } from '../controllers/applicationController';

export interface ClickUpConfig {
  apiKey?: string;
  listId?: string;
  webhookSecret?: string;
  enabled?: boolean;
}

export const PRIORITY_MAP: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

export const CLICKUP_TO_PORTAL_STATUS: Record<string, string> = {
  // Ukrainian synonyms
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

  // English synonyms
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

export function getClickUpConfig(): ClickUpConfig {
  return {
    apiKey: process.env.CLICKUP_API_KEY,
    listId: process.env.CLICKUP_LIST_ID,
    webhookSecret: process.env.CLICKUP_WEBHOOK_SECRET,
    enabled: process.env.CLICKUP_ENABLED !== 'false',
  };
}

export function isClickUpConfigured(): boolean {
  const cfg = getClickUpConfig();
  return Boolean(cfg.apiKey && cfg.listId && cfg.enabled);
}

export function generateClickUpSignature(payload: any, secret: string): string {
  const data = typeof payload === 'string' ? payload : (Buffer.isBuffer(payload) ? payload.toString('utf8') : JSON.stringify(payload));
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function verifyClickUpSignature(payload: any, signature?: string | null, secret?: string | null): boolean {
  if (!signature || !secret) return false;
  try {
    const rawData = typeof payload === 'string' ? payload : (Buffer.isBuffer(payload) ? payload.toString('utf8') : JSON.stringify(payload));
    const computed = crypto.createHmac('sha256', secret).update(rawData).digest('hex');
    const signatureBuffer = Buffer.from(signature, 'hex');
    const computedBuffer = Buffer.from(computed, 'hex');
    if (signatureBuffer.length !== computedBuffer.length) return false;
    return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
  } catch {
    return false;
  }
}

export function formatClickUpTaskPayload(app: any) {
  const priority = PRIORITY_MAP[app.priority] ?? 3;
  const name = `[${app.id || 'NEW'}] ${app.applicantName || 'Applicant'}: ${app.description ? app.description.slice(0, 60) : 'Заявка'}`;

  let description = `### Інформація про заявку\n` +
    `- **ID**: ${app.id || 'N/A'}\n` +
    `- **Замовник**: ${app.applicantName || 'N/A'}\n` +
    `- **Email**: ${app.requesterEmail || 'N/A'}\n` +
    `- **Тип**: ${app.type || 'SERVICE_REQUEST'} (Форма: ${app.formType || 'A'})\n` +
    `- **Підтип**: ${app.subtype || 'N/A'}\n` +
    `- **Пріоритет**: ${app.priority || 'MEDIUM'}\n` +
    `- **WSJF**: ${app.wsjf !== undefined && app.wsjf !== null ? app.wsjf : 'N/A'}\n\n` +
    `### Опис\n${app.description || 'Опис відсутній'}\n`;

  if (app.payload && typeof app.payload === 'object' && Object.keys(app.payload).length > 0) {
    description += '\n### Параметри форми\n```json\n' + JSON.stringify(app.payload, null, 2) + '\n```\n';
  }

  let dueDateMs: number | null = null;
  if (app.dueDate) {
    dueDateMs = new Date(app.dueDate).getTime();
  } else if (app.slaDeadline) {
    dueDateMs = new Date(app.slaDeadline).getTime();
  }

  return {
    name,
    description,
    priority,
    due_date: dueDateMs,
    tags: [
      app.formType ? `form-${app.formType.toLowerCase()}` : 'form-a',
      app.type ? app.type.toLowerCase() : 'service_request',
    ],
  };
}

export function mapClickUpStatus(clickupStatus?: string | null): string | null {
  if (!clickupStatus || typeof clickupStatus !== 'string') return null;
  const normalized = clickupStatus.trim().toLowerCase();
  return CLICKUP_TO_PORTAL_STATUS[normalized] || null;
}

export function mapPortalStatusToClickUp(portalStatus: string): string | null {
  return PORTAL_TO_CLICKUP_STATUS[portalStatus] || null;
}

const outboundEchoCache = new Map<string, number>();

export function recordOutboundEcho(taskId: string, status: string): void {
  const key = `${taskId}:${status.toLowerCase().trim()}`;
  outboundEchoCache.set(key, Date.now() + 60000);
}

export function isRecentOutboundEcho(taskId: string, status: string): boolean {
  const key = `${taskId}:${status.toLowerCase().trim()}`;
  const expiry = outboundEchoCache.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    outboundEchoCache.delete(key);
    return false;
  }
  return true;
}

const recentWebhookEvents = new Map<string, number>();

export function processWebhookWithDedup(taskId: string, status: string, timestamp: number = Date.now()): { duplicate: boolean } {
  const key = `${taskId}:${status.toLowerCase().trim()}`;
  const lastSeen = recentWebhookEvents.get(key);
  if (lastSeen && timestamp - lastSeen < 5000) {
    return { duplicate: true };
  }
  recentWebhookEvents.set(key, timestamp);
  return { duplicate: false };
}

export async function createClickUpTask(app: any): Promise<string | null> {
  const { apiKey, listId } = getClickUpConfig();
  if (!apiKey || !listId) {
    console.warn('[ClickUp] Integration unconfigured. Skipping task creation.');
    return null;
  }

  const payload = formatClickUpTaskPayload(app);
  const url = `https://api.clickup.com/api/v2/list/${listId}/task`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[ClickUp API Error] HTTP ${res.status}: ${res.statusText}`);
      return null;
    }

    const data: any = await res.json();
    const taskId = data?.id || null;

    if (taskId && app.id) {
      try {
        await db.orm.public.Application.where({ id: app.id }).update({ clickupTaskId: taskId });
        await db.orm.public.AuditLog.create({
          applicationId: app.id,
          field: 'CLICKUP_TASK_ID',
          oldValue: null,
          newValue: taskId,
          changedBy: 'ClickUp Integration',
        });
      } catch {
        localStore.updateApplication(app.id, { clickupTaskId: taskId });
        localStore.createAuditLog({
          applicationId: app.id,
          field: 'CLICKUP_TASK_ID',
          oldValue: null,
          newValue: taskId,
          changedBy: 'ClickUp Integration',
        });
      }
      app.clickupTaskId = taskId;
    }

    return taskId;
  } catch (err) {
    console.error('[ClickUp Network Error]', err);
    return null;
  }
}

export async function updateClickUpTaskStatus(taskId: string, portalOrClickUpStatus: string): Promise<boolean> {
  const { apiKey } = getClickUpConfig();
  if (!apiKey || !taskId) {
    console.warn('[ClickUp] Missing apiKey or taskId. Skipping status update.');
    return false;
  }

  const targetStatus = PORTAL_TO_CLICKUP_STATUS[portalOrClickUpStatus] || portalOrClickUpStatus;
  const url = `https://api.clickup.com/api/v2/task/${taskId}`;

  recordOutboundEcho(taskId, targetStatus);

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: targetStatus }),
    });

    if (!res.ok) {
      console.warn(`[ClickUp API Error] HTTP ${res.status}: ${res.statusText}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[ClickUp Network Error]', err);
    return false;
  }
}

export async function findApplicationByClickUpTaskId(taskId: string): Promise<any | null> {
  try {
    const app = await db.orm.public.Application.where({ clickupTaskId: taskId }).first();
    if (app) return app;
  } catch {}
  const apps = localStore.getApplications();
  return apps.find((a) => a.clickupTaskId === taskId) || null;
}

export interface WebhookResult {
  statusCode: number;
  success: boolean;
  message?: string;
  error?: string;
  application?: any;
}

export async function handleInboundClickUpWebhook(
  payload: any,
  signature?: string | null,
  rawBody?: string | Buffer
): Promise<WebhookResult> {
  const { webhookSecret } = getClickUpConfig();

  // 1. Signature Verification
  if (webhookSecret) {
    if (!signature) {
      return { statusCode: 401, success: false, error: 'Missing x-signature header' };
    }

    const bodyToVerify = rawBody || payload;
    const isValid = verifyClickUpSignature(bodyToVerify, signature, webhookSecret);
    if (!isValid) {
      return { statusCode: 401, success: false, error: 'Invalid HMAC signature' };
    }
  }

  // 2. Validate payload structure
  if (!payload || !payload.task_id) {
    return { statusCode: 400, success: false, error: 'Missing task_id in webhook payload' };
  }

  // 3. Extract status from payload or history_items
  let clickupStatus = payload.status;
  if (!clickupStatus && Array.isArray(payload.history_items)) {
    const statusItem = payload.history_items.find((item: any) => item.field === 'status');
    if (statusItem?.after?.status) {
      clickupStatus = statusItem.after.status;
    }
  }

  if (!clickupStatus) {
    return { statusCode: 200, success: true, message: 'No status change in payload' };
  }

  // 4. Map ClickUp status to Portal status
  const targetPortalStatus = mapClickUpStatus(clickupStatus);
  if (!targetPortalStatus) {
    return { statusCode: 200, success: true, message: `Ignored unmapped ClickUp status: ${clickupStatus}` };
  }

  // 5. Check outbound echo
  if (isRecentOutboundEcho(payload.task_id, clickupStatus)) {
    return { statusCode: 200, success: true, message: 'Status update originated from portal (echo ignored)' };
  }

  // 6. Find target application
  const targetApp = await findApplicationByClickUpTaskId(payload.task_id);
  if (!targetApp) {
    return { statusCode: 404, success: false, error: `Application not found for ClickUp task ${payload.task_id}` };
  }

  // 7. Idempotency check
  if (targetApp.status === targetPortalStatus) {
    return { statusCode: 200, success: true, message: 'Status already up to date (idempotent no-op)' };
  }

  // 8. Deduplication check
  const dedup = processWebhookWithDedup(payload.task_id, targetPortalStatus);
  if (dedup.duplicate) {
    return { statusCode: 200, success: true, message: 'Duplicate webhook event suppressed' };
  }

  // 9. Update status in DB / localStore and emit event
  try {
    let updatedApp: any;
    try {
      updatedApp = await db.transaction(async (tx) => {
        const app = await tx.orm.public.Application.where({ id: targetApp.id }).update({ status: targetPortalStatus });
        await tx.orm.public.AuditLog.create({
          applicationId: targetApp.id,
          field: 'STATUS',
          oldValue: targetApp.status,
          newValue: targetPortalStatus,
          changedBy: 'ClickUp Webhook',
        });
        return app;
      });
    } catch {
      updatedApp = localStore.updateApplication(targetApp.id, { status: targetPortalStatus });
      localStore.createAuditLog({
        applicationId: targetApp.id,
        field: 'STATUS',
        oldValue: targetApp.status,
        newValue: targetPortalStatus,
        changedBy: 'ClickUp Webhook',
      });
    }

    try {
      appEvents.emit('application:status_changed', {
        app: updatedApp,
        from: targetApp.status,
        to: targetPortalStatus,
        actorRole: 'SYSTEM_CLICKUP',
        changedBy: 'ClickUp Webhook',
        timestamp: new Date().toISOString(),
      });
      appEvents.emit('statusTransition', {
        app: updatedApp,
        from: targetApp.status,
        to: targetPortalStatus,
        actorRole: 'SYSTEM_CLICKUP',
        changedBy: 'ClickUp Webhook',
        timestamp: new Date().toISOString(),
      });
    } catch (emitErr) {
      console.error('[appEvents emit error]', emitErr);
    }

    return { statusCode: 200, success: true, application: updatedApp };
  } catch (err: any) {
    return { statusCode: 400, success: false, error: err?.message || 'Failed to update application status' };
  }
}

export async function handleClickUpStatusChange(event: {
  app: any;
  from: string | null;
  to: string;
  actorRole?: string;
  changedBy?: string;
}): Promise<void> {
  if (event.changedBy === 'ClickUp Webhook' || event.actorRole === 'SYSTEM_CLICKUP') {
    return;
  }

  const app = event.app;
  if (!app) return;

  if (!app.clickupTaskId) {
    const isCreationTrigger =
      event.to === 'IN_PROGRESS' ||
      event.to === 'APPROVED';

    if (isCreationTrigger) {
      await createClickUpTask(app);
    }
  } else {
    const clickUpStatus = mapPortalStatusToClickUp(event.to);
    if (clickUpStatus) {
      await updateClickUpTaskStatus(app.clickupTaskId, clickUpStatus);
    }
  }
}

let isInitialized = false;

export function initClickUpIntegration(): void {
  if (isInitialized) return;
  isInitialized = true;

  appEvents.on('application:status_changed', (evt: any) => {
    handleClickUpStatusChange(evt).catch((err) => {
      console.error('[ClickUp Status Change Error]', err);
    });
  });
}
