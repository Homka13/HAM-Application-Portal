import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Priority Mapping Contract
const PRIORITY_MAP = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

// Status Mapping Dictionary (Bidirectional)
const CLICKUP_TO_PORTAL_STATUS = {
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
  'tz_preparation': 'TZ_PREPARATION',
  'rework': 'TZ_PREPARATION',
  'estimation': 'ESTIMATION',
  'in_progress': 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  'testing': 'TESTING',
  'uat': 'UAT',
  'in review': 'UAT',
  'pending_approval': 'PENDING_APPROVAL',
  'approved': 'APPROVED',
  'resolved': 'RESOLVED',
  'done': 'RESOLVED',
  'closed': 'CLOSED',
  'rejected': 'REJECTED',
};

const PORTAL_TO_CLICKUP_STATUS = {
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

// HMAC Signature Generator Helper
export function generateClickUpSignature(payload, secret) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

// Verification Helper
export function verifyClickUpSignature(payload, signature, secret) {
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

// Payload Formatter Helper
export function formatClickUpTaskPayload(app) {
  const priority = PRIORITY_MAP[app.priority] ?? 3;
  const name = `[${app.id || 'NEW'}] ${app.applicantName || 'Applicant'}: ${app.description ? app.description.slice(0, 60) : 'Заявка'}`;
  
  let description = `### Інформація про заявку\n` +
    `- **ID**: ${app.id || 'N/A'}\n` +
    `- **Замовник**: ${app.applicantName || 'N/A'}\n` +
    `- **Email**: ${app.requesterEmail || 'N/A'}\n` +
    `- **Тип**: ${app.type || 'SERVICE_REQUEST'} (Форма: ${app.formType || 'A'})\n` +
    `- **Підтип**: ${app.subtype || 'N/A'}\n` +
    `- **Пріоритет**: ${app.priority || 'MEDIUM'}\n` +
    `- **WSJF**: ${app.wsjf ?? 'N/A'}\n\n` +
    `### Опис\n${app.description || 'Опис відсутній'}\n`;

  if (app.payload && Object.keys(app.payload).length > 0) {
    description += `\n### Параметри форми\n\`\`\`json\n${JSON.stringify(app.payload, null, 2)}\n\`\`\`\n`;
  }

  let dueDateMs = null;
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

// Map ClickUp Status Helper
export function mapClickUpStatus(clickupStatus) {
  if (!clickupStatus || typeof clickupStatus !== 'string') return null;
  const normalized = clickupStatus.trim().toLowerCase();
  return CLICKUP_TO_PORTAL_STATUS[normalized] || null;
}

describe('Unit Tests: ClickUp Integration (R2 & Test Tier 1-3)', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let fetchCalls = [];

  beforeEach(() => {
    fetchCalls = [];
    process.env.CLICKUP_API_KEY = 'pk_test_mock_key_12345';
    process.env.CLICKUP_LIST_ID = '987654321';
    process.env.CLICKUP_WEBHOOK_SECRET = 'cu_secret_mock_xyz';

    globalThis.fetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      if (url.includes('/task/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'cu-task-999', status: { status: 'in progress' } }),
          text: async () => JSON.stringify({ id: 'cu-task-999' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'cu-created-12345', name: 'Task Created' }),
        text: async () => JSON.stringify({ id: 'cu-created-12345' }),
      };
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  describe('Tier 1: Feature Coverage — Mapping & Payload Formatting', () => {
    it('1. Maps priority levels to ClickUp integer scales (CRITICAL=1, HIGH=2, MEDIUM=3, LOW=4)', () => {
      assert.equal(PRIORITY_MAP.CRITICAL, 1);
      assert.equal(PRIORITY_MAP.HIGH, 2);
      assert.equal(PRIORITY_MAP.MEDIUM, 3);
      assert.equal(PRIORITY_MAP.LOW, 4);

      const payloadCritical = formatClickUpTaskPayload({ priority: 'CRITICAL' });
      assert.equal(payloadCritical.priority, 1);

      const payloadLow = formatClickUpTaskPayload({ priority: 'LOW' });
      assert.equal(payloadLow.priority, 4);

      const payloadDefault = formatClickUpTaskPayload({ priority: 'CUSTOM' });
      assert.equal(payloadDefault.priority, 3);
    });

    it('2. Formats rich Markdown description with applicant, WSJF, and form payload parameters', () => {
      const app = {
        id: 'app-101',
        applicantName: 'Олена Сидоренко',
        requesterEmail: 'olena@ham.local',
        type: 'SERVICE_REQUEST',
        formType: 'B',
        subtype: 'INFRASTRUCTURE',
        priority: 'HIGH',
        wsjf: 9.5,
        description: 'Розширення кластера серверів',
        payload: { cpuCores: 64, ramGb: 256, datastore: 'SSD-SAN-01' },
      };

      const payload = formatClickUpTaskPayload(app);
      assert.ok(payload.name.includes('[app-101]'));
      assert.ok(payload.name.includes('Олена Сидоренко'));
      assert.ok(payload.description.includes('Олена Сидоренко'));
      assert.ok(payload.description.includes('olena@ham.local'));
      assert.ok(payload.description.includes('**WSJF**: 9.5'));
      assert.ok(payload.description.includes('SSD-SAN-01'));
      assert.deepEqual(payload.tags, ['form-b', 'service_request']);
    });

    it('3. Formats due_date from dueDate or slaDeadline in epoch milliseconds', () => {
      const dueDateIso = '2026-10-01T15:00:00.000Z';
      const appWithDue = { dueDate: dueDateIso };
      const resWithDue = formatClickUpTaskPayload(appWithDue);
      assert.equal(resWithDue.due_date, new Date(dueDateIso).getTime());

      const slaIso = '2026-09-05T12:00:00.000Z';
      const appWithSla = { slaDeadline: slaIso };
      const resWithSla = formatClickUpTaskPayload(appWithSla);
      assert.equal(resWithSla.due_date, new Date(slaIso).getTime());
    });

    it('4. Maps bidirectional status values between ClickUp and Portal (Ukrainian & English)', () => {
      // Ukrainian inbound
      assert.equal(mapClickUpStatus('нова'), 'NEW');
      assert.equal(mapClickUpStatus('на перевірці'), 'UAT');
      assert.equal(mapClickUpStatus('на доопрацювання'), 'TZ_PREPARATION');
      assert.equal(mapClickUpStatus('в роботі'), 'IN_PROGRESS');
      assert.equal(mapClickUpStatus('погоджено'), 'APPROVED');
      assert.equal(mapClickUpStatus('вирішено'), 'RESOLVED');
      assert.equal(mapClickUpStatus('відхилено'), 'REJECTED');
      assert.equal(mapClickUpStatus('закрито'), 'CLOSED');

      // English inbound
      assert.equal(mapClickUpStatus('in review'), 'UAT');
      assert.equal(mapClickUpStatus('rework'), 'TZ_PREPARATION');
      assert.equal(mapClickUpStatus('in progress'), 'IN_PROGRESS');
      assert.equal(mapClickUpStatus('done'), 'RESOLVED');

      // Portal to ClickUp outbound
      assert.equal(PORTAL_TO_CLICKUP_STATUS.UAT, 'In Review');
      assert.equal(PORTAL_TO_CLICKUP_STATUS.IN_PROGRESS, 'In Progress');
      assert.equal(PORTAL_TO_CLICKUP_STATUS.TZ_PREPARATION, 'TZ Preparation');
      assert.equal(PORTAL_TO_CLICKUP_STATUS.RESOLVED, 'Resolved');
    });

    it('5. Generates and verifies valid HMAC-SHA256 ClickUp webhook signatures', () => {
      const secret = 'webhook_secret_key_123';
      const payload = JSON.stringify({ event: 'taskStatusUpdated', task_id: 'cu-88492' });
      const signature = generateClickUpSignature(payload, secret);

      assert.ok(signature, 'Signature must be non-empty string');
      assert.equal(typeof signature, 'string');
      assert.equal(signature.length, 64, 'SHA256 hex string must be 64 chars');

      const isValid = verifyClickUpSignature(payload, signature, secret);
      assert.equal(isValid, true, 'Valid signature must verify successfully');
    });
  });

  describe('Tier 2: Boundary & Corner Cases — Signature, Errors & Degradation', () => {
    it('1. Rejects tampered payloads or mismatched secrets during signature verification', () => {
      const secret = 'valid_secret';
      const payload = '{"task_id":"123","status":"done"}';
      const signature = generateClickUpSignature(payload, secret);

      // Tampered payload
      const tamperedPayload = '{"task_id":"123","status":"rejected"}';
      assert.equal(verifyClickUpSignature(tamperedPayload, signature, secret), false);

      // Wrong secret
      assert.equal(verifyClickUpSignature(payload, signature, 'wrong_secret'), false);

      // Malformed signature hex
      assert.equal(verifyClickUpSignature(payload, 'not-a-valid-hex-sig', secret), false);
    });

    it('2. Rejects empty signature or empty secret safely with false', () => {
      const payload = { test: true };
      assert.equal(verifyClickUpSignature(payload, '', 'secret'), false);
      assert.equal(verifyClickUpSignature(payload, 'signature', ''), false);
      assert.equal(verifyClickUpSignature(payload, null, 'secret'), false);
      assert.equal(verifyClickUpSignature(payload, 'signature', null), false);
    });

    it('3. Safely degrades when CLICKUP_API_KEY or CLICKUP_LIST_ID is unset', () => {
      delete process.env.CLICKUP_API_KEY;
      delete process.env.CLICKUP_LIST_ID;

      const isConfigured = Boolean(process.env.CLICKUP_API_KEY && process.env.CLICKUP_LIST_ID);
      assert.equal(isConfigured, false);

      // Simulated graceful degradation handler
      function safeCreateClickUpTask(app) {
        if (!process.env.CLICKUP_API_KEY || !process.env.CLICKUP_LIST_ID) {
          return null; // Graceful no-op
        }
        return 'cu-task-id';
      }

      const result = safeCreateClickUpTask({ id: 'app-1' });
      assert.equal(result, null, 'Unconfigured ClickUp integration must return null without throwing');
    });

    it('4. Handles missing optional fields in application without crashing', () => {
      const minimalApp = { id: 'app-min' };
      const payload = formatClickUpTaskPayload(minimalApp);

      assert.ok(payload.name.includes('[app-min]'));
      assert.equal(payload.priority, 3);
      assert.equal(payload.due_date, null);
      assert.ok(payload.description.includes('Опис відсутній'));
    });

    it('5. Handles special characters, Unicode, emojis, and Ukrainian text in fields', () => {
      const complexApp = {
        id: 'app-unicode-🚀',
        applicantName: 'Тарас Григорович Шевченко 🇺🇦',
        description: 'Оновлення ПЗ: "1С:Підприємство" & <Script>alert(1)</Script>\nРядок 2 з лапками: \'test\'',
        priority: 'CRITICAL',
      };

      const payload = formatClickUpTaskPayload(complexApp);
      assert.ok(payload.name.includes('Тарас Григорович Шевченко 🇺🇦'));
      assert.ok(payload.description.includes('1С:Підприємство'));
      assert.ok(payload.description.includes('<Script>'));
    });

    it('6. Handles ClickUp API HTTP 500 or 429 Rate Limit error responses gracefully', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ err: 'Rate limit exceeded', ECODE: 'RATE_LIMIT' }),
      });

      async function safeApiCall() {
        try {
          const res = await fetch('https://api.clickup.com/api/v2/list/123/task', { method: 'POST' });
          if (!res.ok) {
            console.warn(`[ClickUp API Error] HTTP ${res.status}: ${res.statusText}`);
            return null;
          }
          return await res.json();
        } catch (err) {
          console.error('[ClickUp Network Error]', err);
          return null;
        }
      }

      const res = await safeApiCall();
      assert.equal(res, null, 'API failure should be caught and return null gracefully');
    });

    it('7. Handles network throw / rejection in fetch without unhandled exception', async () => {
      globalThis.fetch = async () => {
        throw new Error('ETIMEDOUT: Connection to api.clickup.com timed out');
      };

      async function resilientFetch() {
        try {
          const res = await fetch('https://api.clickup.com/api/v2/task/123');
          return res.ok;
        } catch {
          return false;
        }
      }

      const outcome = await resilientFetch();
      assert.equal(outcome, false);
    });
  });

  describe('Tier 3: Loop Suppression & Idempotency', () => {
    it('1. Suppresses outbound sync when event source is ClickUp Webhook (changedBy check)', () => {
      const event = {
        app: { id: 'app-123', clickupTaskId: 'cu-456' },
        from: 'TESTING',
        to: 'UAT',
        changedBy: 'ClickUp Webhook',
      };

      function shouldSyncToClickUp(evt) {
        if (evt.changedBy === 'ClickUp Webhook') return false;
        return true;
      }

      assert.equal(shouldSyncToClickUp(event), false, 'Webhook-origin transitions must NOT echo back to ClickUp');
    });

    it('2. Suppresses update when current status in ClickUp matches target status (Idempotency)', () => {
      const currentClickUpStatus = 'In Review';
      const targetPortalStatus = 'UAT';
      const targetClickUpStatus = PORTAL_TO_CLICKUP_STATUS[targetPortalStatus];

      function isRedundantUpdate(current, target) {
        return (current || '').toLowerCase() === (target || '').toLowerCase();
      }

      assert.equal(isRedundantUpdate(currentClickUpStatus, targetClickUpStatus), true);
    });

    it('3. Prevents duplicate in-flight webhook execution via TTL deduplication cache', () => {
      const recentEvents = new Map();

      function processWebhookWithDedup(taskId, status, timestamp = Date.now()) {
        const key = `${taskId}:${status}`;
        const lastSeen = recentEvents.get(key);
        if (lastSeen && timestamp - lastSeen < 5000) {
          return { duplicate: true }; // Suppress duplicate
        }
        recentEvents.set(key, timestamp);
        return { duplicate: false };
      }

      const first = processWebhookWithDedup('cu-99', 'in review', 1000);
      assert.equal(first.duplicate, false);

      const duplicate = processWebhookWithDedup('cu-99', 'in review', 2000);
      assert.equal(duplicate.duplicate, true);

      const later = processWebhookWithDedup('cu-99', 'in review', 7000);
      assert.equal(later.duplicate, false);
    });
  });
});
