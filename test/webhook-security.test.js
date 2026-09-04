import test, { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import app from '../dist/index.js';

function signPayload(data, secret) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  return crypto.createHmac('sha256', secret).update(buf).digest('hex');
}

describe('ClickUp Webhook Security Regression Suite (Audit C.1 & C.2 Remediation)', () => {
  const TEST_SECRET = 'cu_sec_test_secret_key_7788';
  const ISOLATED_DB_FILE = path.join(process.cwd(), 'data', 'local-db-webhook-test.json');
  let originalEnvSecret;

  // Preserve original fs functions to prevent storage contention with concurrent tests
  const origWriteFileSync = fs.writeFileSync;
  const origReadFileSync = fs.readFileSync;
  const origExistsSync = fs.existsSync;

  before(() => {
    // Intercept fs calls targeting local-db.json to redirect to an isolated test db file
    fs.writeFileSync = function (file, data, options) {
      if (typeof file === 'string' && file.includes('local-db.json')) {
        return origWriteFileSync.call(fs, ISOLATED_DB_FILE, data, options);
      }
      return origWriteFileSync.apply(fs, arguments);
    };

    fs.readFileSync = function (file, options) {
      if (typeof file === 'string' && file.includes('local-db.json')) {
        if (origExistsSync.call(fs, ISOLATED_DB_FILE)) {
          return origReadFileSync.call(fs, ISOLATED_DB_FILE, options);
        }
      }
      return origReadFileSync.apply(fs, arguments);
    };

    fs.existsSync = function (file) {
      if (typeof file === 'string' && file.includes('local-db.json')) {
        return origExistsSync.call(fs, ISOLATED_DB_FILE) || origExistsSync.call(fs, file);
      }
      return origExistsSync.apply(fs, arguments);
    };
  });

  after(() => {
    fs.writeFileSync = origWriteFileSync;
    fs.readFileSync = origReadFileSync;
    fs.existsSync = origExistsSync;
    try {
      if (origExistsSync.call(fs, ISOLATED_DB_FILE)) {
        fs.unlinkSync(ISOLATED_DB_FILE);
      }
    } catch {}
  });

  beforeEach(() => {
    originalEnvSecret = process.env.CLICKUP_WEBHOOK_SECRET;
  });

  afterEach(() => {
    if (originalEnvSecret !== undefined) {
      process.env.CLICKUP_WEBHOOK_SECRET = originalEnvSecret;
    } else {
      delete process.env.CLICKUP_WEBHOOK_SECRET;
    }
  });

  describe('T1: Fail-Closed Authentication (Audit C.1)', () => {
    it('returns 503 Service Unavailable when CLICKUP_WEBHOOK_SECRET is unset/missing', async () => {
      delete process.env.CLICKUP_WEBHOOK_SECRET;

      const payload = { task_id: 'task-sec-1', status: 'in_progress' };
      const res = await request(app)
        .post('/api/webhooks/clickup')
        .send(payload);

      assert.equal(res.status, 503);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /CLICKUP_WEBHOOK_SECRET is not configured/i);
    });

    it('returns 503 Service Unavailable when CLICKUP_WEBHOOK_SECRET is empty string', async () => {
      process.env.CLICKUP_WEBHOOK_SECRET = '   ';

      const payload = { task_id: 'task-sec-1', status: 'in_progress' };
      const res = await request(app)
        .post('/api/webhooks/clickup')
        .send(payload);

      assert.equal(res.status, 503);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /CLICKUP_WEBHOOK_SECRET is not configured/i);
    });
  });

  describe('T2: Signature Authentication Validation (Audit C.1)', () => {
    beforeEach(() => {
      process.env.CLICKUP_WEBHOOK_SECRET = TEST_SECRET;
    });

    it('returns 401 Unauthorized when signature header is completely missing', async () => {
      const payload = { task_id: 'task-sec-1', status: 'in_progress' };
      const res = await request(app)
        .post('/api/webhooks/clickup')
        .send(payload);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /signature/i);
    });

    it('returns 401 Unauthorized when signature is invalid/tampered', async () => {
      const payload = { task_id: 'task-sec-1', status: 'in_progress' };
      const fakeSig = 'a'.repeat(64);

      const res = await request(app)
        .post('/api/webhooks/clickup')
        .set('x-signature', fakeSig)
        .send(payload);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Invalid HMAC signature/i);
    });

    it('returns 401 Unauthorized for malformed/odd-length signature hex', async () => {
      const payload = { task_id: 'task-sec-1', status: 'in_progress' };
      const res = await request(app)
        .post('/api/webhooks/clickup')
        .set('x-signature', 'not-a-valid-hex')
        .send(payload);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });
  });

  describe('T3: Valid Raw HMAC & Status Synchronization (Audit C.2)', () => {
    let testTaskId;

    before(async () => {
      process.env.CLICKUP_WEBHOOK_SECRET = TEST_SECRET;
      testTaskId = 'cu-task-sec-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Тестовий Користувач',
          type: 'SERVICE_REQUEST',
          priority: 'MEDIUM',
          clickupTaskId: testTaskId,
        });
      assert.equal(createRes.status, 201);
    });

    beforeEach(() => {
      process.env.CLICKUP_WEBHOOK_SECRET = TEST_SECRET;
    });

    it('synchronizes status to IN_PROGRESS with valid x-signature over raw buffer', async () => {
      const rawPayload = JSON.stringify({
        task_id: testTaskId,
        status: 'в роботі',
      });
      const signature = signPayload(Buffer.from(rawPayload, 'utf8'), TEST_SECRET);

      const res = await request(app)
        .post('/api/webhooks/clickup')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(rawPayload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.application.status, 'IN_PROGRESS');
    });

    it('accepts x-clickup-signature header as alternative valid header', async () => {
      const rawPayload = JSON.stringify({
        task_id: testTaskId,
        status: 'вирішено',
      });
      const signature = signPayload(Buffer.from(rawPayload, 'utf8'), TEST_SECRET);

      const res = await request(app)
        .post('/api/webhooks/clickup')
        .set('Content-Type', 'application/json')
        .set('x-clickup-signature', signature)
        .send(rawPayload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.application.status, 'RESOLVED');
    });
  });

  describe('T4: Raw Body Bytes vs Re-serialized JSON Verification Guard (Audit C.2)', () => {
    let testTaskId;

    before(async () => {
      process.env.CLICKUP_WEBHOOK_SECRET = TEST_SECRET;
      testTaskId = 'cu-task-raw-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const createRes = await request(app)
        .post('/api/applications')
        .send({
          applicantName: 'Тестовий Співробітник',
          type: 'INCIDENT',
          priority: 'HIGH',
          clickupTaskId: testTaskId,
        });
      assert.equal(createRes.status, 201);
    });

    beforeEach(() => {
      process.env.CLICKUP_WEBHOOK_SECRET = TEST_SECRET;
    });

    it('succeeds when raw body contains custom whitespace and key ordering', async () => {
      const rawPayload = '{\n  "event": "taskStatusUpdated",\n  "status": "в роботі",\n  "task_id": "' + testTaskId + '"\n}';
      const rawSig = signPayload(Buffer.from(rawPayload, 'utf8'), TEST_SECRET);

      const res = await request(app)
        .post('/api/webhooks/clickup')
        .set('Content-Type', 'application/json')
        .set('x-signature', rawSig)
        .send(rawPayload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.application.status, 'IN_PROGRESS');
    });

    it('fails when signature is computed over re-serialized JSON while raw body differs', async () => {
      const rawPayload = '{\n  "status": "тестування",\n  "task_id": "' + testTaskId + '"\n}';

      // Signature computed over re-serialized stripped JSON
      const parsed = JSON.parse(rawPayload);
      const reSerialized = JSON.stringify(parsed);
      const flawedSig = signPayload(Buffer.from(reSerialized, 'utf8'), TEST_SECRET);

      const res = await request(app)
        .post('/api/webhooks/clickup')
        .set('Content-Type', 'application/json')
        .set('x-signature', flawedSig)
        .send(rawPayload);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Invalid HMAC signature/i);
    });

    it('correctly validates raw buffer with multibyte UTF-8 characters (Ukrainian text & emojis)', async () => {
      const rawPayload = JSON.stringify({
        task_id: testTaskId,
        status: 'на перевірці',
        description: 'Опис українською мовою з емодзі: 🇺🇦 🚀',
      });
      const signature = signPayload(Buffer.from(rawPayload, 'utf8'), TEST_SECRET);

      const res = await request(app)
        .post('/api/webhooks/clickup')
        .set('Content-Type', 'application/json')
        .set('x-signature', signature)
        .send(rawPayload);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.application.status, 'UAT');
    });
  });
});
