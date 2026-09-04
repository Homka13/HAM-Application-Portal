import test, { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import app from '../../dist/index.js';

// Extract SLA_HOURS dynamically from source code (not hardcoding)
function getSlaHoursFromSource() {
  const filePath = path.resolve(process.cwd(), 'src/controllers/applicationController.ts');
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/const\s+SLA_HOURS\s*:\s*Record<string,\s*number>\s*=\s*({[\s\S]*?});/);
  if (!match) {
    throw new Error('Failed to extract SLA_HOURS from applicationController.ts');
  }
  return Function(`"use strict"; return (${match[1]})`)();
}

describe('G1: Application Priority & SLA Deadline Resolution Suite', () => {
  let controller;
  let SLA_HOURS;

  before(() => {
    controller = globalThis.__applicationController;
    assert.ok(controller, 'globalThis.__applicationController must be defined');
    assert.equal(typeof controller.createApplication, 'function', 'createApplication must be a function');

    SLA_HOURS = getSlaHoursFromSource();
    assert.ok(SLA_HOURS, 'SLA_HOURS must be successfully loaded from source');
    assert.equal(typeof SLA_HOURS.CRITICAL, 'number', 'SLA_HOURS.CRITICAL must be defined');
    assert.equal(typeof SLA_HOURS.HIGH, 'number', 'SLA_HOURS.HIGH must be defined');
    assert.equal(typeof SLA_HOURS.MEDIUM, 'number', 'SLA_HOURS.MEDIUM must be defined');
    assert.equal(typeof SLA_HOURS.LOW, 'number', 'SLA_HOURS.LOW must be defined');
  });

  function createMockRes() {
    return {
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
  }

  function assertSlaDeadline(actualDeadlineIso, expectedHours, startTime, endTime) {
    assert.ok(actualDeadlineIso, 'slaDeadline must be present');
    const deadlineMs = new Date(actualDeadlineIso).getTime();
    assert.ok(!Number.isNaN(deadlineMs), 'slaDeadline must be a valid ISO date');

    const minExpected = startTime + expectedHours * 60 * 60 * 1000;
    const maxExpected = endTime + expectedHours * 60 * 60 * 1000;
    assert.ok(
      deadlineMs >= minExpected - 1000 && deadlineMs <= maxExpected + 1000,
      `slaDeadline (${actualDeadlineIso}) must match expected SLA duration of ${expectedHours} hours`
    );

    const diffHours = Math.round((deadlineMs - startTime) / (60 * 60 * 1000));
    assert.equal(diffHours, expectedHours, `Computed SLA delta in hours must equal ${expectedHours}`);
  }

  // T1: priority='HIGH', computedPriority absent -> saved priority='HIGH', SLA deadline = SLA_HOURS['HIGH']
  it('T1: preserves explicit priority="HIGH" and assigns SLA_HOURS["HIGH"] deadline when computedPriority is absent', async () => {
    const mockReq = {
      body: {
        applicantName: 'T1 Applicant',
        type: 'SERVICE_REQUEST',
        priority: 'HIGH',
        description: 'Testing explicit HIGH priority without computedPriority',
        formType: 'A',
      },
      user: { role: 'USER', email: 't1@ham.local' },
    };
    const mockRes = createMockRes();

    const start = Date.now();
    await controller.createApplication(mockReq, mockRes);
    const end = Date.now();

    assert.equal(mockRes.statusCode, 201);
    assert.ok(mockRes.jsonData?.id);
    assert.equal(mockRes.jsonData.priority, 'HIGH', 'Saved priority must be HIGH');
    assertSlaDeadline(mockRes.jsonData.slaDeadline, SLA_HOURS.HIGH, start, end);
  });

  // T2: priority absent, computedPriority='CRITICAL' -> saved priority='CRITICAL', SLA deadline = SLA_HOURS['CRITICAL']
  it('T2: inherits computedPriority="CRITICAL" and assigns SLA_HOURS["CRITICAL"] deadline when explicit priority is absent', async () => {
    const mockReq = {
      body: {
        applicantName: 'T2 Applicant',
        type: 'INCIDENT',
        computedPriority: 'CRITICAL',
        description: 'Testing computedPriority inheritance when priority is undefined',
        formType: 'C',
      },
      user: { role: 'USER', email: 't2@ham.local' },
    };
    const mockRes = createMockRes();

    const start = Date.now();
    await controller.createApplication(mockReq, mockRes);
    const end = Date.now();

    assert.equal(mockRes.statusCode, 201);
    assert.ok(mockRes.jsonData?.id);
    assert.equal(mockRes.jsonData.priority, 'CRITICAL', 'Saved priority must inherit computedPriority (CRITICAL)');
    assertSlaDeadline(mockRes.jsonData.slaDeadline, SLA_HOURS.CRITICAL, start, end);
  });

  // T3: both absent -> fallback priority='MEDIUM', SLA deadline = SLA_HOURS['MEDIUM']
  it('T3: falls back to priority="MEDIUM" and assigns SLA_HOURS["MEDIUM"] deadline when both priority and computedPriority are absent', async () => {
    const mockReq = {
      body: {
        applicantName: 'T3 Applicant',
        type: 'SERVICE_REQUEST',
        description: 'Testing fallback to default MEDIUM priority',
        formType: 'B',
      },
      user: { role: 'USER', email: 't3@ham.local' },
    };
    const mockRes = createMockRes();

    const start = Date.now();
    await controller.createApplication(mockReq, mockRes);
    const end = Date.now();

    assert.equal(mockRes.statusCode, 201);
    assert.ok(mockRes.jsonData?.id);
    assert.equal(mockRes.jsonData.priority, 'MEDIUM', 'Saved priority must fall back to MEDIUM');
    assertSlaDeadline(mockRes.jsonData.slaDeadline, SLA_HOURS.MEDIUM, start, end);
  });

  // T4: both priority and computedPriority present -> explicit priority wins
  it('T4: explicit priority wins over computedPriority when both are present', async () => {
    const mockReq = {
      body: {
        applicantName: 'T4 Applicant',
        type: 'SERVICE_REQUEST',
        priority: 'LOW',
        computedPriority: 'CRITICAL',
        description: 'Testing precedence: explicit LOW must override computed CRITICAL',
        formType: 'A',
      },
      user: { role: 'USER', email: 't4@ham.local' },
    };
    const mockRes = createMockRes();

    const start = Date.now();
    await controller.createApplication(mockReq, mockRes);
    const end = Date.now();

    assert.equal(mockRes.statusCode, 201);
    assert.ok(mockRes.jsonData?.id);
    assert.equal(mockRes.jsonData.priority, 'LOW', 'Explicit priority (LOW) must take precedence over computedPriority');
    assertSlaDeadline(mockRes.jsonData.slaDeadline, SLA_HOURS.LOW, start, end);
  });
});
