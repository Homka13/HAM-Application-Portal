import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../dist/index.js';

describe('Integration Tests: HAM Portal REST API', () => {
  let createdAppId = '';
  let createdChangeId = '';
  let createdProblemId = '';
  let createdArticleId = '';

  describe('1. Health & Prometheus Metrics Endpoints', () => {
    it('GET /api/health returns 200 and { status: "ok" }', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.ok(res.body.time);
    });

    it('GET /metrics returns Prometheus metric series', async () => {
      const res = await request(app).get('/metrics');
      assert.equal(res.status, 200);
      assert.match(res.text, /http_requests_total/);
    });
  });

  describe('2. Applications API (/api/applications)', () => {
    it('POST /api/applications validates body and rejects missing applicantName', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ type: 'SERVICE_REQUEST', priority: 'LOW' });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Validation failed');
      const applicantErr = res.body.details.find((d) => d.field === 'applicantName');
      assert.ok(applicantErr, 'Expected validation error for applicantName');
    });

    it('POST /api/applications validates and rejects invalid enum for priority and type', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({ applicantName: 'Тест', type: 'INVALID_TYPE', priority: 'INVALID_PRIORITY' });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Validation failed');
      assert.equal(res.body.details.length, 2);
    });

    it('POST /api/applications successfully creates a new ticket with valid payload', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Олена Сидоренко',
          type: 'INCIDENT',
          priority: 'HIGH',
          description: 'Проблема з принтером у кабінеті 204',
          serviceCatalogId: 'srv-5',
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      assert.equal(res.body.applicantName, 'Олена Сидоренко');
      assert.equal(res.body.status, 'NEW');
      assert.equal(res.body.priority, 'HIGH');
      assert.ok(res.body.slaDeadline);

      createdAppId = res.body.id;
    });

    it('POST /api/applications creates ticket with formType (A-E), payload, WSJF, and tracking fields', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Богдан Хмельницький',
          type: 'SERVICE_REQUEST',
          priority: 'MEDIUM',
          description: 'Розширення корпоративної мережі',
          formType: 'B',
          subtype: 'INFRASTRUCTURE',
          payload: { serverRoom: 'A-12', rackUnits: 4, powerKwh: 1.5 },
          requesterEmail: 'b.khmelnytsky@ham.local',
          bv: 8.0,
          r: 5.0,
          tc: 7.0,
          aw: 4.0,
          effort: 3.0,
          wsjf: 8.0,
          impact: 'HIGH',
          urgency: 'MEDIUM',
          severity: 'MAJOR',
          computedPriority: 'P2',
          pocId: 'poc-eng-99',
          dueDate: '2026-10-15T00:00:00.000Z',
          clickupTaskId: 'cu-8694021',
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      assert.equal(res.body.formType, 'B');
      assert.equal(res.body.subtype, 'INFRASTRUCTURE');
      assert.deepEqual(res.body.payload, { serverRoom: 'A-12', rackUnits: 4, powerKwh: 1.5 });
      assert.equal(res.body.requesterEmail, 'b.khmelnytsky@ham.local');
      assert.equal(res.body.wsjf, 8.0);
      assert.equal(res.body.clickupTaskId, 'cu-8694021');
    });

    it('Rule 1: Rejects subtype «Доробка» without URL, accepts with URL', async () => {
      // 1. Missing URL -> 400
      const rejectRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Ігор Шевченко',
          subtype: 'Доробка',
          payload: { feature: 'Новий звіт' },
        });
      assert.equal(rejectRes.status, 400);
      assert.ok(rejectRes.body.details.some((d) => d.field.includes('url')));

      // 2. With URL -> 201
      const acceptRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Ігор Шевченко',
          subtype: 'Доробка',
          payload: { feature: 'Новий звіт', url: 'https://crm.company.local/reports' },
        });
      assert.equal(acceptRes.status, 201);
    });

    it('Rule 2: Rejects TC >= 4 without dueDate, accepts with dueDate', async () => {
      // 1. TC >= 4 without dueDate -> 400
      const rejectRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Анна Франко',
          tc: 5,
        });
      assert.equal(rejectRes.status, 400);
      assert.ok(rejectRes.body.details.some((d) => d.field === 'dueDate'));

      // 2. TC >= 4 with dueDate -> 201
      const acceptRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Анна Франко',
          tc: 5,
          dueDate: '2026-09-10T18:00:00.000Z',
        });
      assert.equal(acceptRes.status, 201);
    });

    it('Rule 3: Rejects Form B with subtype «Вивантаження» without exportParams, accepts with exportParams', async () => {
      // 1. Missing exportParams -> 400
      const rejectRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Віктор Кравчук',
          formType: 'B',
          subtype: 'Вивантаження',
          payload: {},
        });
      assert.equal(rejectRes.status, 400);
      assert.ok(rejectRes.body.details.some((d) => d.field.includes('exportParams')));

      // 2. With exportParams -> 201
      const acceptRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Віктор Кравчук',
          formType: 'B',
          subtype: 'Вивантаження',
          payload: { exportParams: { format: 'XLSX', dateRange: '2026-Q3' } },
        });
      assert.equal(acceptRes.status, 201);
    });

    it('Rule 4: Rejects Form D with subtype «Доступ» without role, accepts with role', async () => {
      // 1. Missing role -> 400
      const rejectRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Юлія Тимощук',
          formType: 'D',
          subtype: 'Доступ',
          payload: {},
        });
      assert.equal(rejectRes.status, 400);
      assert.ok(rejectRes.body.details.some((d) => d.field.includes('role')));

      // 2. With role -> 201
      const acceptRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Юлія Тимощук',
          formType: 'D',
          subtype: 'Доступ',
          payload: { role: 'SAP_FINANCE_ACCOUNTANT' },
        });
      assert.equal(acceptRes.status, 201);
    });

    it('Rule 5: Rejects Form D with subtype «Ліцензія» without license, accepts with license', async () => {
      // 1. Missing license -> 400
      const rejectRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Дмитро Гончар',
          formType: 'D',
          subtype: 'Ліцензія',
          payload: {},
        });
      assert.equal(rejectRes.status, 400);
      assert.ok(rejectRes.body.details.some((d) => d.field.includes('license')));

      // 2. With license -> 201
      const acceptRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Дмитро Гончар',
          formType: 'D',
          subtype: 'Ліцензія',
          payload: { license: 'JetBrains All Products Pack' },
        });
      assert.equal(acceptRes.status, 201);
    });

    it('GET /api/applications returns list containing created applications', async () => {
      const res = await request(app).get('/api/applications');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      const found = res.body.find((a) => a.id === createdAppId);
      assert.ok(found, 'Created application should be in the list');
    });

    it('Branch A/B/E: Transitions through NEW -> TZ_PREPARATION -> ESTIMATION -> IN_PROGRESS -> TESTING -> UAT -> RESOLVED -> CLOSED', async () => {
      const branchAApp = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Олена Петренко',
          formType: 'A',
          description: 'Розробка модуля CRM',
        });
      const appId = branchAApp.body.id;

      // 1. NEW -> TZ_PREPARATION
      let res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'TZ_PREPARATION', changedBy: 'analyst@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'TZ_PREPARATION');

      // 2. TZ_PREPARATION -> ESTIMATION
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'ESTIMATION', changedBy: 'lead@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ESTIMATION');

      // 3. ESTIMATION -> IN_PROGRESS
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'IN_PROGRESS', changedBy: 'dev@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'IN_PROGRESS');

      // 4. IN_PROGRESS -> TESTING
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'TESTING', changedBy: 'qa@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'TESTING');

      // 5. TESTING -> UAT
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'UAT', changedBy: 'qa@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'UAT');

      // 6. UAT -> RESOLVED (requires resolution note)
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'RESOLVED', changedBy: 'user@ham.local', resolutionNote: 'Протестовано і прийнято в UAT' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'RESOLVED');

      // 7. RESOLVED -> CLOSED
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'CLOSED', changedBy: 'system' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'CLOSED');
    });

    it('Branch C: Transitions through NEW -> TRIAGE -> IN_PROGRESS -> RESOLVED for incident', async () => {
      const incidentApp = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Черговий інженер',
          type: 'INCIDENT',
          priority: 'CRITICAL',
          description: 'Збій бази даних',
        });
      const appId = incidentApp.body.id;

      // 1. NEW -> TRIAGE
      let res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'TRIAGE', changedBy: 'oncall@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'TRIAGE');

      // 2. TRIAGE -> IN_PROGRESS
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'IN_PROGRESS', changedBy: 'dba@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'IN_PROGRESS');

      // 3. IN_PROGRESS -> RESOLVED
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'RESOLVED', changedBy: 'dba@ham.local', resolutionNote: 'Кластер переключено на резервну ноду' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'RESOLVED');
    });

    it('Branch D: Transitions through NEW -> PENDING_APPROVAL -> APPROVED -> IN_PROGRESS -> RESOLVED', async () => {
      const accessApp = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Марія Коваль',
          formType: 'D',
          subtype: 'Доступ',
          payload: { role: 'BI_VIEWER' },
        });
      const appId = accessApp.body.id;

      // 1. NEW -> PENDING_APPROVAL
      let res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'PENDING_APPROVAL', changedBy: 'user@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'PENDING_APPROVAL');

      // 2. PENDING_APPROVAL -> APPROVED
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'APPROVED', changedBy: 'manager@ham.local' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'APPROVED');

      // 3. APPROVED -> RESOLVED
      res = await request(app).patch(`/api/applications/${appId}/status`).send({ status: 'RESOLVED', changedBy: 'admin@ham.local', resolutionNote: 'Роль призначено в IAM' });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'RESOLVED');
    });

    it('GET /api/applications/:id/logs returns audit history logs for status changes', async () => {
      const res = await request(app).get(`/api/applications/${createdAppId}/logs`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    });
  });

  describe('3. Services Catalog API (/api/services)', () => {
    it('GET /api/services returns all catalog services including Power BI, Номенклатура, Зупинка виробництва', async () => {
      const res = await request(app).get('/api/services');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length >= 9);

      const names = res.body.map((s) => s.name);
      assert.ok(names.includes('Створення звіт павер бі'));
      assert.ok(names.includes('Отримання доступу до павер бі'));
      assert.ok(names.includes('Створення заявки на номенклатуру'));
      assert.ok(names.includes('Зупинка виробництва'));
    });

    it('Synchronizes type with service: «Зупинка виробництва» -> INCIDENT', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Цех №3',
          serviceCatalogId: 'srv-9',
          description: 'Зупинка головного конвеєра',
        });
      assert.equal(res.status, 201);
      assert.equal(res.body.type, 'INCIDENT');
    });

    it('Synchronizes type with service: «Створення звіт павер бі» -> SERVICE_REQUEST', async () => {
      const res = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Аналітик Денис',
          serviceCatalogId: 'srv-6',
          description: 'Звіт з продажів за серпень',
        });
      assert.equal(res.status, 201);
      assert.equal(res.body.type, 'SERVICE_REQUEST');
    });
  });

  describe('4. Change Requests API (/api/changes)', () => {
    it('POST /api/changes creates a new change request', async () => {
      const res = await request(app)
        .post('/api/changes')
        .send({
          title: 'Оновлення маршрутизатора ядра мережі',
          description: 'Планове оновлення прошивки Cisco Catalyst',
          type: 'NORMAL',
          risk: 'MEDIUM',
          scheduledAt: '2026-09-05T20:00:00.000Z',
          requestedBy: 'netadmin@ham.local',
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      assert.equal(res.body.status, 'DRAFT');
      createdChangeId = res.body.id;
    });

    it('PATCH /api/changes/:id/status executes workflow DRAFT -> PENDING -> APPROVED', async () => {
      // Step 1: DRAFT -> PENDING
      const pRes = await request(app)
        .patch(`/api/changes/${createdChangeId}/status`)
        .send({ status: 'PENDING' });
      assert.equal(pRes.status, 200);
      assert.equal(pRes.body.status, 'PENDING');

      // Step 2: PENDING -> APPROVED
      const aRes = await request(app)
        .patch(`/api/changes/${createdChangeId}/status`)
        .send({ status: 'APPROVED', approvedBy: 'cab_head@ham.local' });
      assert.equal(aRes.status, 200);
      assert.equal(aRes.body.status, 'APPROVED');
    });
  });

  describe('5. Problems Management API (/api/problems)', () => {
    it('POST /api/problems creates a new problem record', async () => {
      const res = await request(app)
        .post('/api/problems')
        .send({
          title: 'Періодичне зникнення доступу до поштового сервера',
          description: 'Високе навантаження на диск під час резервного копіювання',
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      assert.equal(res.body.status, 'NEW');
      createdProblemId = res.body.id;
    });

    it('PATCH /api/problems/:id/status updates status through RCA to RESOLVED', async () => {
      const res = await request(app)
        .patch(`/api/problems/${createdProblemId}/status`)
        .send({
          status: 'RCA',
          rootCause: 'Низька швидкість I/O дискової підсистеми',
          workaround: 'Змінити час бекапу на 03:00',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'RCA');
    });
  });

  describe('6. Knowledge Base API (/api/kb)', () => {
    it('POST /api/kb creates a new KB article in DRAFT status', async () => {
      const res = await request(app)
        .post('/api/kb')
        .send({
          title: 'Інструкція з налаштування пошти на iOS',
          content: '1. Відкрийте Налаштування -> Пошта -> Додати обліковий запис Exchange...',
          category: 'Mobile',
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      assert.equal(res.body.status, 'DRAFT');
      createdArticleId = res.body.id;
    });

    it('PATCH /api/kb/:id/status publishes article (DRAFT -> PUBLISHED)', async () => {
      const res = await request(app)
        .patch(`/api/kb/${createdArticleId}/status`)
        .send({ status: 'PUBLISHED' });

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'PUBLISHED');
    });

    it('GET /api/kb/search finds published articles by query', async () => {
      const res = await request(app).get('/api/kb/search?q=iOS');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.some((a) => a.id === createdArticleId));
    });
  });

  describe('7. Reports & Metrics API (/api/reports)', () => {
    it('GET /api/reports/stats returns calculated ITSM statistics', async () => {
      const res = await request(app).get('/api/reports/stats');
      assert.equal(res.status, 200);
      assert.ok(typeof res.body.slaRate === 'number');
      assert.ok(typeof res.body.totalIncidents === 'number');
      assert.ok(Array.isArray(res.body.incidentVolume));
      assert.ok(res.body.byStatus);
    });
  });
});
