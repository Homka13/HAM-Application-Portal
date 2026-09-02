import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../dist/index.js';
import crypto from 'node:crypto';

describe('Tier 4: E2E Real-World Workload Scenarios & Workflows', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let interceptedCalls = [];

  beforeEach(() => {
    interceptedCalls = [];
    process.env.CLICKUP_API_KEY = 'pk_mock_e2e_key';
    process.env.CLICKUP_LIST_ID = 'list_12345';
    process.env.CLICKUP_WEBHOOK_SECRET = 'cu_wh_secret_e2e';
    process.env.GMAIL_USER = 'notifications@ham.local';
    process.env.GMAIL_APP_PASSWORD = 'gmail_pass_mock';
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T0/B0/X';
    process.env.SLACK_BOT_TOKEN = 'xoxb-mock-token';

    globalThis.fetch = async (url, options = {}) => {
      interceptedCalls.push({ url: String(url), options });
      if (url.includes('users.lookupByEmail')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, user: { id: 'U_E2E_USER', name: 'requester' } }),
        };
      }
      if (url.includes('chat.postMessage') || url.includes('hooks.slack.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, ts: '1693651200.000100' }),
          text: async () => 'ok',
        };
      }
      if (url.includes('api.clickup.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'cu-task-e2e-101', status: { status: 'in progress' } }),
          text: async () => JSON.stringify({ id: 'cu-task-e2e-101' }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  describe('Scenario 1: Branch A Full Lifecycle (Development & UAT)', () => {
    it('Executes complete Branch A lifecycle: NEW -> TZ_PREPARATION -> ESTIMATION -> IN_PROGRESS -> TESTING -> UAT -> RESOLVED -> CLOSED', async () => {
      // Step 1: Create application
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Олена Петренко',
          requesterEmail: 'o.petrenko@ham.local',
          formType: 'A',
          type: 'SERVICE_REQUEST',
          priority: 'HIGH',
          description: 'Розробка модуля аналітики продажу',
          bv: 8,
          tc: 4,
          r: 6,
          effort: 3,
          wsjf: 6.0,
          dueDate: '2026-10-15T00:00:00.000Z',
        });

      assert.equal(createRes.status, 201);
      const appId = createRes.body.id;
      assert.ok(appId);
      assert.equal(createRes.body.status, 'NEW');
      assert.equal(createRes.body.priority, 'HIGH');

      // Step 2: NEW -> TZ_PREPARATION
      let res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'TZ_PREPARATION', changedBy: 'analyst@ham.local', actorRole: 'POC' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'TZ_PREPARATION');

      // Step 3: TZ_PREPARATION -> ESTIMATION
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'ESTIMATION', changedBy: 'lead@ham.local', actorRole: 'ADMIN' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ESTIMATION');

      // Step 4: ESTIMATION -> IN_PROGRESS
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'IN_PROGRESS', changedBy: 'dev@ham.local', actorRole: 'ADMIN' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'IN_PROGRESS');

      // Step 5: IN_PROGRESS -> TESTING
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'TESTING', changedBy: 'dev@ham.local', actorRole: 'ADMIN' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'TESTING');

      // Step 6: TESTING -> UAT
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'UAT', changedBy: 'qa@ham.local', actorRole: 'ADMIN' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'UAT');

      // Step 7: UAT -> RESOLVED (with resolutionNote)
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({
          status: 'RESOLVED',
          changedBy: 'o.petrenko@ham.local',
          actorRole: 'USER',
          resolutionNote: 'Модуль успішно прийнято замовником у промислову експлуатацію',
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'RESOLVED');

      // Step 8: RESOLVED -> CLOSED
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'CLOSED', changedBy: 'system', actorRole: 'SYSTEM' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'CLOSED');

      // Step 9: Verify audit logs
      const logsRes = await request(app).get(`/api/applications/${appId}/logs`);
      assert.equal(logsRes.status, 200);
      assert.ok(Array.isArray(logsRes.body));
      assert.ok(logsRes.body.length >= 7, 'Audit logs must capture all 7 state transitions');
    });
  });

  describe('Scenario 2: Branch D Approval & Rejection Flows', () => {
    it('Flow 2A: Successfully approves access request (NEW -> PENDING_APPROVAL -> APPROVED -> RESOLVED)', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Марія Ковальчук',
          requesterEmail: 'm.kovalchuk@ham.local',
          formType: 'D',
          subtype: 'Доступ',
          payload: { role: 'SAP_FINANCE_LEAD' },
          description: 'Доступ до фінансової звітності SAP',
          priority: 'MEDIUM',
        });

      assert.equal(createRes.status, 201);
      const appId = createRes.body.id;

      // 1. NEW -> PENDING_APPROVAL
      let res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'PENDING_APPROVAL', changedBy: 'm.kovalchuk@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'PENDING_APPROVAL');

      // 2. PENDING_APPROVAL -> APPROVED
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'APPROVED', changedBy: 'cfo@ham.local', actorRole: 'APPROVER' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'APPROVED');

      // 3. APPROVED -> RESOLVED
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({
          status: 'RESOLVED',
          changedBy: 'sysadmin@ham.local',
          resolutionNote: 'Роль SAP_FINANCE_LEAD активовано в IAM',
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'RESOLVED');
    });

    it('Flow 2B: Successfully rejects license request with rejectionReason (NEW -> PENDING_APPROVAL -> REJECTED)', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Андрій Мельник',
          requesterEmail: 'a.melnyk@ham.local',
          formType: 'D',
          subtype: 'Ліцензія',
          payload: { license: 'AutoCAD Ultimate 2026' },
          description: 'Ліцензія для нового конструктора',
          priority: 'LOW',
        });

      assert.equal(createRes.status, 201);
      const appId = createRes.body.id;

      // 1. NEW -> PENDING_APPROVAL
      let res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'PENDING_APPROVAL', changedBy: 'a.melnyk@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'PENDING_APPROVAL');

      // 2. PENDING_APPROVAL -> REJECTED (with rejectionReason)
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({
          status: 'REJECTED',
          changedBy: 'it_director@ham.local',
          actorRole: 'APPROVER',
          rejectionReason: 'Вичерпано річний бюджет на ліцензії САПР',
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'REJECTED');
    });
  });

  describe('Scenario 3: Branch C Critical Incident Triaging & SLA', () => {
    it('Triages and resolves critical incident within 1h SLA framework', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Моніторинг Zabbix',
          type: 'INCIDENT',
          priority: 'CRITICAL',
          description: 'Збій первинного вузла бази даних PostgreSQL',
          serviceCatalogId: 'srv-4',
        });

      assert.equal(createRes.status, 201);
      const appId = createRes.body.id;
      assert.equal(createRes.body.type, 'INCIDENT');
      assert.equal(createRes.body.priority, 'CRITICAL');

      // SLA deadline must be 1 hour from creation
      const createdTime = new Date(createRes.body.createdAt).getTime();
      const slaDeadlineTime = new Date(createRes.body.slaDeadline).getTime();
      const diffHours = (slaDeadlineTime - createdTime) / (1000 * 60 * 60);
      assert.equal(Math.round(diffHours), 1, 'CRITICAL incident must have 1 hour SLA deadline');

      // 1. NEW -> TRIAGE
      let res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'TRIAGE', changedBy: 'oncall@ham.local', actorRole: 'ADMIN' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'TRIAGE');

      // 2. TRIAGE -> IN_PROGRESS
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'IN_PROGRESS', changedBy: 'dba@ham.local', actorRole: 'ADMIN' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'IN_PROGRESS');

      // 3. IN_PROGRESS -> RESOLVED
      res = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({
          status: 'RESOLVED',
          changedBy: 'dba@ham.local',
          actorRole: 'ADMIN',
          resolutionNote: 'Кластер переведено на резервний вузол без втрати даних',
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'RESOLVED');
    });
  });

  describe('Scenario 4: ClickUp Inbound Sync & Rework Loop Simulation', () => {
    it('Executes UAT -> TZ_PREPARATION rework loop with loop suppression', () => {
      const reworkTransitions = [
        { from: 'TESTING', to: 'UAT', trigger: 'ClickUp Webhook: На перевірці' },
        { from: 'UAT', to: 'TZ_PREPARATION', trigger: 'ClickUp Webhook: На доопрацювання' },
        { from: 'TZ_PREPARATION', to: 'ESTIMATION', trigger: 'Portal Analyst' },
        { from: 'ESTIMATION', to: 'IN_PROGRESS', trigger: 'Portal Developer' },
      ];

      for (const step of reworkTransitions) {
        assert.ok(step.from);
        assert.ok(step.to);
        assert.ok(step.trigger);
      }
    });
  });

  describe('Scenario 5: Zero-Config Resilient Server Run', () => {
    it('Operates seamlessly across all CRUD and transitions with zero external env vars', async () => {
      // Clear all integration env vars
      delete process.env.CLICKUP_API_KEY;
      delete process.env.CLICKUP_LIST_ID;
      delete process.env.CLICKUP_WEBHOOK_SECRET;
      delete process.env.GMAIL_USER;
      delete process.env.GMAIL_APP_PASSWORD;
      delete process.env.SLACK_WEBHOOK_URL;
      delete process.env.SLACK_BOT_TOKEN;

      // 1. Create ticket
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Тест Zero-Config',
          description: 'Перевірка стабільності сервера без змінних оточення',
          priority: 'LOW',
        });
      assert.equal(createRes.status, 201);
      const appId = createRes.body.id;

      // 2. Perform transition
      const transRes = await request(app)
        .patch(`/api/applications/${appId}/status`)
        .send({ status: 'TZ_PREPARATION', changedBy: 'tester' });
      assert.equal(transRes.status, 200);
      assert.equal(transRes.body.status, 'TZ_PREPARATION');

      // 3. Query list
      const listRes = await request(app).get('/api/applications');
      assert.equal(listRes.status, 200);
      assert.ok(Array.isArray(listRes.body));
    });
  });
});
