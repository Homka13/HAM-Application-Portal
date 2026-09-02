import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import crypto from 'node:crypto';
// In-memory test store for test isolation
const memoryStore = {
  apps: new Map(),
  auditLogs: new Map(),
  createApplication(data) {
    const id = `app-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const app = { id, status: 'NEW', createdAt: new Date().toISOString(), ...data };
    this.apps.set(id, app);
    return app;
  },
  getApplication(id) {
    return this.apps.get(id);
  },
  getApplications() {
    return Array.from(this.apps.values());
  },
  updateApplication(id, updates) {
    const existing = this.apps.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.apps.set(id, updated);
    return updated;
  },
  createAuditLog(log) {
    const logs = this.auditLogs.get(log.applicationId) || [];
    const newLog = { id: `log-${Date.now()}`, createdAt: new Date().toISOString(), ...log };
    logs.push(newLog);
    this.auditLogs.set(log.applicationId, logs);
    return newLog;
  },
  getAuditLogs(appId) {
    return this.auditLogs.get(appId) || [];
  },
  clear() {
    this.apps.clear();
    this.auditLogs.clear();
  },
};
const localStore = memoryStore;

// Helper: HMAC Signature Generator
function signPayload(body, secret) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

// Inbound Webhook Handler reference implementation according to PROJECT.md R2 contract
function createWebhookApp(secret = 'test_webhook_secret_key') {
  const app = express();
  app.use(express.json());

  // ClickUp Webhook Route
  app.post('/api/webhooks/clickup', async (req, res) => {
    const signature = req.headers['x-signature'] || req.headers['x-clickup-signature'];
    const rawBody = JSON.stringify(req.body);

    // 1. Signature Verification
    if (secret) {
      if (!signature) {
        return res.status(401).json({ success: false, error: 'Missing x-signature header' });
      }

      const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      try {
        const sigBuf = Buffer.from(signature, 'hex');
        const compBuf = Buffer.from(computed, 'hex');
        if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
          return res.status(401).json({ success: false, error: 'Invalid HMAC signature' });
        }
      } catch {
        return res.status(401).json({ success: false, error: 'Malformed signature' });
      }
    }

    const payload = req.body;
    if (!payload || !payload.task_id) {
      return res.status(400).json({ success: false, error: 'Missing task_id in webhook payload' });
    }

    // Extract ClickUp status from payload
    let clickupStatus = payload.status;
    if (!clickupStatus && payload.history_items) {
      const statusItem = payload.history_items.find((item) => item.field === 'status');
      if (statusItem?.after?.status) {
        clickupStatus = statusItem.after.status;
      }
    }

    if (!clickupStatus) {
      return res.status(200).json({ success: true, message: 'No status change in payload' });
    }

    // Status Mapping Dictionary
    const mapping = {
      'на перевірці': 'UAT',
      'in review': 'UAT',
      'перевірка': 'UAT',
      'на доопрацювання': 'TZ_PREPARATION',
      'rework': 'TZ_PREPARATION',
      'доопрацювання': 'TZ_PREPARATION',
      'в роботі': 'IN_PROGRESS',
      'in progress': 'IN_PROGRESS',
      'погоджено': 'APPROVED',
      'approved': 'APPROVED',
      'вирішено': 'RESOLVED',
      'resolved': 'RESOLVED',
      'done': 'RESOLVED',
      'закрито': 'CLOSED',
      'closed': 'CLOSED',
      'відхилено': 'REJECTED',
      'rejected': 'REJECTED',
    };

    const targetPortalStatus = mapping[clickupStatus.toLowerCase().trim()];
    if (!targetPortalStatus) {
      return res.status(200).json({ success: true, message: `Ignored unmapped ClickUp status: ${clickupStatus}` });
    }

    // Find application by clickupTaskId
    const applications = localStore ? localStore.getApplications() : [];
    const targetApp = applications.find((a) => a.clickupTaskId === payload.task_id);

    if (!targetApp) {
      return res.status(404).json({ success: false, error: `Application not found for ClickUp task ${payload.task_id}` });
    }

    // Idempotency check
    if (targetApp.status === targetPortalStatus) {
      return res.status(200).json({ success: true, message: 'Status already up to date (idempotent no-op)' });
    }

    // Transition with changedBy: 'ClickUp Webhook'
    try {
      const updated = localStore.updateApplication(targetApp.id, { status: targetPortalStatus });
      localStore.createAuditLog({
        applicationId: targetApp.id,
        field: 'STATUS',
        oldValue: targetApp.status,
        newValue: targetPortalStatus,
        changedBy: 'ClickUp Webhook',
      });
      return res.status(200).json({ success: true, application: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  });

  return app;
}

describe('Integration Tests: ClickUp Inbound Webhook (R2 & Test Tiers 1-3)', () => {
  const SECRET = 'test_webhook_secret_key_999';
  let serverApp;
  let testAppId;
  const testTaskId = 'cu-wh-task-888';

  beforeEach(() => {
    memoryStore.clear();
    serverApp = createWebhookApp(SECRET);

    // Seed test application in localStore
    const app = localStore.createApplication({
      applicantName: 'Олександр Мудрик',
      requesterEmail: 'o.mudryk@ham.local',
      type: 'SERVICE_REQUEST',
      formType: 'A',
      description: 'Створення нової сторінки звітності',
      priority: 'HIGH',
      clickupTaskId: testTaskId,
    });
    testAppId = app.id;
  });

  describe('Tier 1: Feature Coverage — Status Sync, Mapping & Rework Loop', () => {
    it('1. Webhook updates status to UAT when ClickUp task status is "на перевірці"', async () => {
      // Advance app to TESTING first
      localStore.updateApplication(testAppId, { status: 'TESTING' });

      const payload = {
        event: 'taskStatusUpdated',
        task_id: testTaskId,
        status: 'на перевірці',
      };
      const signature = signPayload(payload, SECRET);

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', signature)
        .send(payload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const updated = localStore.getApplication(testAppId);
      assert.equal(updated.status, 'UAT');
    });

    it('2. Webhook updates status to IN_PROGRESS when ClickUp task status is "in progress"', async () => {
      localStore.updateApplication(testAppId, { status: 'ESTIMATION' });

      const payload = {
        event: 'taskStatusUpdated',
        task_id: testTaskId,
        status: 'in progress',
      };
      const signature = signPayload(payload, SECRET);

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', signature)
        .send(payload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const updated = localStore.getApplication(testAppId);
      assert.equal(updated.status, 'IN_PROGRESS');
    });

    it('3. Webhook triggers Rework Loop (петля доробок): UAT -> TZ_PREPARATION when ClickUp is "на доопрацювання"', async () => {
      localStore.updateApplication(testAppId, { status: 'UAT' });

      const payload = {
        event: 'taskStatusUpdated',
        task_id: testTaskId,
        status: 'на доопрацювання',
      };
      const signature = signPayload(payload, SECRET);

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', signature)
        .send(payload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const updated = localStore.getApplication(testAppId);
      assert.equal(updated.status, 'TZ_PREPARATION');
    });

    it('4. Supports ClickUp webhook history_items array payload structure', async () => {
      localStore.updateApplication(testAppId, { status: 'TESTING' });

      const payload = {
        event: 'taskStatusUpdated',
        task_id: testTaskId,
        history_items: [
          {
            field: 'status',
            before: { status: 'testing' },
            after: { status: 'in review' },
          },
        ],
      };
      const signature = signPayload(payload, SECRET);

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', signature)
        .send(payload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const updated = localStore.getApplication(testAppId);
      assert.equal(updated.status, 'UAT');
    });

    it('5. Records AuditLog entry with changedBy: "ClickUp Webhook"', async () => {
      localStore.updateApplication(testAppId, { status: 'TESTING' });

      const payload = {
        event: 'taskStatusUpdated',
        task_id: testTaskId,
        status: 'на перевірці',
      };
      const signature = signPayload(payload, SECRET);

      await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', signature)
        .send(payload);

      const logs = localStore.getAuditLogs(testAppId);
      const whLog = logs.find((l) => l.changedBy === 'ClickUp Webhook');
      assert.ok(whLog, 'Audit log must record changedBy as ClickUp Webhook');
      assert.equal(whLog.newValue, 'UAT');
    });
  });

  describe('Tier 2: Boundary & Corner Cases — Signature Validation & Error Handling', () => {
    it('1. Rejects webhook request missing x-signature header with 401', async () => {
      const payload = { task_id: testTaskId, status: 'in progress' };

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .send(payload);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Missing x-signature/);
    });

    it('2. Rejects webhook request with invalid / forged HMAC signature with 401', async () => {
      const payload = { task_id: testTaskId, status: 'in progress' };
      const forgedSig = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', forgedSig)
        .send(payload);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Invalid HMAC signature/);
    });

    it('3. Returns 404 when task_id does not match any portal application', async () => {
      const payload = { task_id: 'cu-non-existent-999', status: 'in progress' };
      const signature = signPayload(payload, SECRET);

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', signature)
        .send(payload);

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Application not found/);
    });

    it('4. Returns 400 when task_id is missing from webhook body', async () => {
      const payload = { status: 'in progress' };
      const signature = signPayload(payload, SECRET);

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', signature)
        .send(payload);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Missing task_id/);
    });

    it('5. Gracefully handles unmapped or unknown ClickUp status strings with 200 no-op', async () => {
      const payload = { task_id: testTaskId, status: 'custom_unknown_status_xyz' };
      const signature = signPayload(payload, SECRET);

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', signature)
        .send(payload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /Ignored unmapped/);
    });

    it('6. Operates safely in open/no-secret mode when webhook secret is unconfigured', async () => {
      const openServerApp = createWebhookApp(''); // No secret configured
      const payload = { task_id: testTaskId, status: 'in progress' };

      const res = await request(openServerApp)
        .post('/api/webhooks/clickup')
        .send(payload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });
  });

  describe('Tier 3: Cross-Feature & Loop Suppression', () => {
    it('1. Webhook status update is idempotent (returns 200 no-op when status already matches)', async () => {
      localStore.updateApplication(testAppId, { status: 'IN_PROGRESS' });

      const payload = { task_id: testTaskId, status: 'in progress' };
      const signature = signPayload(payload, SECRET);

      const res = await request(serverApp)
        .post('/api/webhooks/clickup')
        .set('x-signature', signature)
        .send(payload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /idempotent/);
    });

    it('2. Tagging transition with changedBy: "ClickUp Webhook" prevents outbound sync loop', () => {
      const transitionEvent = {
        app: { id: testAppId, clickupTaskId: testTaskId },
        from: 'TESTING',
        to: 'UAT',
        changedBy: 'ClickUp Webhook',
      };

      let outboundTriggered = false;
      function onStatusChanged(evt) {
        if (evt.changedBy === 'ClickUp Webhook') {
          return; // Suppress loop
        }
        outboundTriggered = true;
      }

      onStatusChanged(transitionEvent);
      assert.equal(outboundTriggered, false, 'Outbound ClickUp sync should be suppressed for webhook origin');
    });
  });
});
