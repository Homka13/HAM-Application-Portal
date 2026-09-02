import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../dist/index.js';

describe('Milestone 1 (R1): Event Seam & EventEmitter Tests', () => {
  let appEvents;
  let controller;

  beforeEach(() => {
    appEvents = globalThis.__appEvents;
    controller = globalThis.__applicationController;
    assert.ok(appEvents, 'globalThis.__appEvents must be defined');
    assert.ok(controller, 'globalThis.__applicationController must be defined');
  });

  describe('1. EventEmitter Configuration & Health', () => {
    it('appEvents is defined and has maxListeners set to 50', () => {
      assert.ok(appEvents);
      assert.equal(typeof appEvents.on, 'function');
      assert.equal(typeof appEvents.emit, 'function');
      assert.equal(appEvents.getMaxListeners(), 50);
    });

    it('appEvents has an error listener registered to prevent uncaught exceptions', () => {
      const listeners = appEvents.listeners('error');
      assert.ok(listeners.length > 0, 'Expected at least one error listener registered on appEvents');
      // Emitting error event must not throw unhandled exception
      assert.doesNotThrow(() => {
        appEvents.emit('error', new Error('Simulated handled error'));
      });
    });
  });

  describe('2. Event Emission on Application Creation (from: null -> to: "NEW")', () => {
    it('Emits application:status_changed and statusTransition on application creation', async () => {
      const receivedStatusChanged = [];
      const receivedStatusTransition = [];

      const onStatusChanged = (evt) => receivedStatusChanged.push(evt);
      const onStatusTransition = (evt) => receivedStatusTransition.push(evt);

      appEvents.on('application:status_changed', onStatusChanged);
      appEvents.on('statusTransition', onStatusTransition);

      try {
        const mockReq = {
          body: {
            applicantName: 'Іван Коваленко',
            type: 'SERVICE_REQUEST',
            priority: 'HIGH',
            description: 'Заявка для тесту емісії подій',
            formType: 'A',
          },
          user: { role: 'USER', email: 'ivan@ham.local' },
        };
        const mockRes = {
          statusCode: 200,
          jsonData: null,
          status(code) {
            this.statusCode = code;
            return this;
          },
          json(data) {
            this.jsonData = data;
            return this;
          },
        };

        await controller.createApplication(mockReq, mockRes);
        assert.equal(mockRes.statusCode, 201);
        assert.ok(mockRes.jsonData?.id);

        // Verify application:status_changed
        assert.equal(receivedStatusChanged.length, 1);
        const evt1 = receivedStatusChanged[0];
        assert.equal(evt1.app.id, mockRes.jsonData.id);
        assert.equal(evt1.from, null);
        assert.equal(evt1.to, 'NEW');
        assert.equal(evt1.actorRole, 'USER');
        assert.ok(evt1.timestamp);
        assert.ok(!Number.isNaN(new Date(evt1.timestamp).getTime()), 'Valid ISO timestamp');

        // Verify statusTransition alias
        assert.equal(receivedStatusTransition.length, 1);
        const evt2 = receivedStatusTransition[0];
        assert.equal(evt2.app.id, mockRes.jsonData.id);
        assert.equal(evt2.from, null);
        assert.equal(evt2.to, 'NEW');
      } finally {
        appEvents.off('application:status_changed', onStatusChanged);
        appEvents.off('statusTransition', onStatusTransition);
      }
    });
  });

  describe('3. Event Emission on Status Transitions & Metadata Integrity', () => {
    it('Emits status transition event on valid state update', async () => {
      // Create an application first
      const createReq = {
        body: {
          applicantName: 'Марія Мельник',
          type: 'SERVICE_REQUEST',
          priority: 'MEDIUM',
          description: 'Тест переходу статусу',
          formType: 'A',
        },
      };
      const createRes = {
        status(code) { this.statusCode = code; return this; },
        json(data) { this.jsonData = data; return this; },
      };
      await controller.createApplication(createReq, createRes);
      const appId = createRes.jsonData.id;

      const receivedEvents = [];
      const onEvent = (evt) => receivedEvents.push(evt);
      appEvents.on('application:status_changed', onEvent);

      try {
        const updateReq = {
          params: { id: appId },
          body: {
            status: 'TZ_PREPARATION',
            changedBy: 'analyst@ham.local',
            actorRole: 'POC',
          },
        };
        const updateRes = {
          status(code) { this.statusCode = code; return this; },
          json(data) { this.jsonData = data; return this; },
        };

        await controller.updateApplicationStatus(updateReq, updateRes);
        assert.equal(updateRes.statusCode, 200);
        assert.equal(updateRes.jsonData.status, 'TZ_PREPARATION');

        assert.equal(receivedEvents.length, 1);
        const evt = receivedEvents[0];
        assert.equal(evt.app.id, appId);
        assert.equal(evt.from, 'NEW');
        assert.equal(evt.to, 'TZ_PREPARATION');
        assert.equal(evt.changedBy, 'analyst@ham.local');
        assert.equal(evt.actorRole, 'POC');
        assert.ok(evt.timestamp);
      } finally {
        appEvents.off('application:status_changed', onEvent);
      }
    });

    it('Emits resolutionNote on RESOLVED transition', async () => {
      // Create Branch C (Incident) app
      const createReq = {
        body: {
          applicantName: 'Черговий Інженер',
          type: 'INCIDENT',
          priority: 'CRITICAL',
          description: 'Аварійний інцидент',
        },
      };
      const createRes = {
        status(code) { this.statusCode = code; return this; },
        json(data) { this.jsonData = data; return this; },
      };
      await controller.createApplication(createReq, createRes);
      const appId = createRes.jsonData.id;

      // Move to TRIAGE
      await controller.updateApplicationStatus(
        { params: { id: appId }, body: { status: 'TRIAGE', changedBy: 'oncall@ham.local' } },
        { status() { return this; }, json() { return this; } },
      );

      const receivedEvents = [];
      const onEvent = (evt) => receivedEvents.push(evt);
      appEvents.on('application:status_changed', onEvent);

      try {
        // Move TRIAGE -> RESOLVED with resolutionNote
        const resReq = {
          params: { id: appId },
          body: {
            status: 'RESOLVED',
            changedBy: 'lead@ham.local',
            actorRole: 'ADMIN',
            resolutionNote: 'Помилку виправлено в конфігурації',
          },
        };
        const resRes = {
          status(code) { this.statusCode = code; return this; },
          json(data) { this.jsonData = data; return this; },
        };

        await controller.updateApplicationStatus(resReq, resRes);
        assert.equal(resRes.statusCode, 200);

        assert.equal(receivedEvents.length, 1);
        const evt = receivedEvents[0];
        assert.equal(evt.from, 'TRIAGE');
        assert.equal(evt.to, 'RESOLVED');
        assert.equal(evt.resolutionNote, 'Помилку виправлено в конфігурації');
        assert.equal(evt.changedBy, 'lead@ham.local');
        assert.equal(evt.actorRole, 'ADMIN');
      } finally {
        appEvents.off('application:status_changed', onEvent);
      }
    });

    it('Emits rejectionReason on REJECTED transition', async () => {
      // Create Branch D (Access) app
      const createReq = {
        body: {
          applicantName: 'Стажер Петро',
          formType: 'D',
          subtype: 'Доступ',
          payload: { role: 'PROD_ADMIN' },
        },
      };
      const createRes = {
        status(code) { this.statusCode = code; return this; },
        json(data) { this.jsonData = data; return this; },
      };
      await controller.createApplication(createReq, createRes);
      const appId = createRes.jsonData.id;

      const receivedEvents = [];
      const onEvent = (evt) => receivedEvents.push(evt);
      appEvents.on('application:status_changed', onEvent);

      try {
        const rejReq = {
          params: { id: appId },
          body: {
            status: 'REJECTED',
            changedBy: 'security@ham.local',
            actorRole: 'APPROVER',
            rejectionReason: 'Відхилено службою безпеки',
          },
        };
        const rejRes = {
          status(code) { this.statusCode = code; return this; },
          json(data) { this.jsonData = data; return this; },
        };

        await controller.updateApplicationStatus(rejReq, rejRes);
        assert.equal(rejRes.statusCode, 200);

        assert.equal(receivedEvents.length, 1);
        const evt = receivedEvents[0];
        assert.equal(evt.from, 'NEW');
        assert.equal(evt.to, 'REJECTED');
        assert.equal(evt.rejectionReason, 'Відхилено службою безпеки');
        assert.equal(evt.changedBy, 'security@ham.local');
        assert.equal(evt.actorRole, 'APPROVER');
      } finally {
        appEvents.off('application:status_changed', onEvent);
      }
    });
  });

  describe('4. Guardrails: No-Op and Validation Failure Suppression', () => {
    it('Does NOT emit event when status update is an identical status no-op', async () => {
      const createReq = {
        body: { applicantName: 'Олег Савчук', formType: 'A', description: 'Тест no-op' },
      };
      const createRes = {
        status(code) { this.statusCode = code; return this; },
        json(data) { this.jsonData = data; return this; },
      };
      await controller.createApplication(createReq, createRes);
      const appId = createRes.jsonData.id;

      // Update NEW -> TZ_PREPARATION
      await controller.updateApplicationStatus(
        { params: { id: appId }, body: { status: 'TZ_PREPARATION', changedBy: 'analyst@ham.local' } },
        { status() { return this; }, json() { return this; } },
      );

      const receivedEvents = [];
      const onEvent = (evt) => receivedEvents.push(evt);
      appEvents.on('application:status_changed', onEvent);

      try {
        // Send identical status TZ_PREPARATION -> TZ_PREPARATION
        const noopReq = {
          params: { id: appId },
          body: { status: 'TZ_PREPARATION', changedBy: 'analyst@ham.local' },
        };
        const noopRes = {
          status(code) { this.statusCode = code; return this; },
          json(data) { this.jsonData = data; return this; },
        };

        await controller.updateApplicationStatus(noopReq, noopRes);
        assert.equal(noopRes.statusCode, 200);
        assert.equal(receivedEvents.length, 0, 'No event should be emitted for status no-op');
      } finally {
        appEvents.off('application:status_changed', onEvent);
      }
    });

    it('Does NOT emit event when transition is invalid (disallowed branch transition)', async () => {
      const createReq = {
        body: { applicantName: 'Олег Савчук', formType: 'A', description: 'Тест забороненого переходу' },
      };
      const createRes = {
        status(code) { this.statusCode = code; return this; },
        json(data) { this.jsonData = data; return this; },
      };
      await controller.createApplication(createReq, createRes);
      const appId = createRes.jsonData.id;

      const receivedEvents = [];
      const onEvent = (evt) => receivedEvents.push(evt);
      appEvents.on('application:status_changed', onEvent);

      try {
        // Branch A cannot jump NEW -> CLOSED directly
        const invalidReq = {
          params: { id: appId },
          body: { status: 'CLOSED', changedBy: 'admin@ham.local' },
        };
        const invalidRes = {
          status(code) { this.statusCode = code; return this; },
          json(data) { this.jsonData = data; return this; },
        };

        await assert.rejects(
          async () => {
            await controller.updateApplicationStatus(invalidReq, invalidRes);
          },
          /Недопустимий перехід/,
        );

        assert.equal(receivedEvents.length, 0, 'No event should be emitted on validation rejection');
      } finally {
        appEvents.off('application:status_changed', onEvent);
      }
    });

    it('Does NOT emit event when RESOLVED transition lacks required resolutionNote', async () => {
      // Create Branch C ticket and move to TRIAGE
      const createReq = {
        body: { applicantName: 'Олег Савчук', type: 'INCIDENT', priority: 'HIGH' },
      };
      const createRes = {
        status(code) { this.statusCode = code; return this; },
        json(data) { this.jsonData = data; return this; },
      };
      await controller.createApplication(createReq, createRes);
      const appId = createRes.jsonData.id;

      await controller.updateApplicationStatus(
        { params: { id: appId }, body: { status: 'TRIAGE' } },
        { status() { return this; }, json() { return this; } },
      );

      const receivedEvents = [];
      const onEvent = (evt) => receivedEvents.push(evt);
      appEvents.on('application:status_changed', onEvent);

      try {
        // Attempt TRIAGE -> RESOLVED without resolutionNote
        const updateReq = {
          params: { id: appId },
          body: { status: 'RESOLVED' },
        };
        const updateRes = {
          status(code) { this.statusCode = code; return this; },
          json(data) { this.jsonData = data; return this; },
        };

        await assert.rejects(
          async () => {
            await controller.updateApplicationStatus(updateReq, updateRes);
          },
          /resolutionNote/,
        );

        assert.equal(receivedEvents.length, 0, 'No event should be emitted when resolutionNote is missing');
      } finally {
        appEvents.off('application:status_changed', onEvent);
      }
    });

    it('Does NOT emit event when application ID does not exist', async () => {
      const receivedEvents = [];
      const onEvent = (evt) => receivedEvents.push(evt);
      appEvents.on('application:status_changed', onEvent);

      try {
        const updateReq = {
          params: { id: 'non-existent-ticket-id-9999' },
          body: { status: 'IN_PROGRESS' },
        };
        const updateRes = {
          status(code) { this.statusCode = code; return this; },
          json(data) { this.jsonData = data; return this; },
        };

        await assert.rejects(
          async () => {
            await controller.updateApplicationStatus(updateReq, updateRes);
          },
          /Application not found/,
        );

        assert.equal(receivedEvents.length, 0, 'No event should be emitted for non-existent ticket');
      } finally {
        appEvents.off('application:status_changed', onEvent);
      }
    });
  });

  describe('5. Listener Error Isolation & Resilience', () => {
    it('Subscriber error in event listener does not crash or interrupt controller execution', async () => {
      const errorThrowingListener = () => {
        throw new Error('Subscriber internal fault');
      };

      appEvents.on('application:status_changed', errorThrowingListener);

      try {
        const mockReq = {
          body: {
            applicantName: 'Тест Ізоляції Помилок',
            type: 'SERVICE_REQUEST',
            priority: 'LOW',
            description: 'Перевірка стійкості до помилок підписників',
          },
        };
        const mockRes = {
          statusCode: 200,
          jsonData: null,
          status(code) { this.statusCode = code; return this; },
          json(data) { this.jsonData = data; return this; },
        };

        // Must succeed without throwing
        await controller.createApplication(mockReq, mockRes);
        assert.equal(mockRes.statusCode, 201);
        assert.ok(mockRes.jsonData?.id);
      } finally {
        appEvents.off('application:status_changed', errorThrowingListener);
      }
    });
  });

  describe('6. End-to-End REST Route Event Triggering', () => {
    it('Triggers status events on HTTP POST /api/applications', async () => {
      const received = [];
      const listener = (evt) => received.push(evt);
      appEvents.on('application:status_changed', listener);

      try {
        const res = await request(app)
          .post('/api/applications')
          .send({
            applicantName: 'HTTP Заявник',
            type: 'SERVICE_REQUEST',
            priority: 'LOW',
            description: 'HTTP маршрут тестування подій',
          });

        assert.equal(res.status, 201);
        assert.equal(received.length, 1);
        assert.equal(received[0].app.id, res.body.id);
        assert.equal(received[0].from, null);
        assert.equal(received[0].to, 'NEW');
      } finally {
        appEvents.off('application:status_changed', listener);
      }
    });
  });
});
