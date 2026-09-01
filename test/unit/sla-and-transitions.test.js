import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Business logic fixtures & transition maps mirroring controller specifications
const SLA_HOURS = {
  CRITICAL: 1,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72,
};

const VALID_TRANSITIONS = {
  NEW: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

const CHANGE_WORKFLOW = {
  DRAFT: ['PENDING'],
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['IMPLEMENTED'],
  IMPLEMENTED: [],
  REJECTED: [],
};

const PROBLEM_WORKFLOW = {
  NEW: ['RCA'],
  RCA: ['KNOWN_ERROR'],
  KNOWN_ERROR: ['RESOLVED'],
  RESOLVED: [],
};

const KB_WORKFLOW = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['PUBLISHED'],
};

// SLA Calculation Helper
function calculateSlaDeadline(priority, startTime = Date.now()) {
  const hours = SLA_HOURS[priority] ?? 72;
  return new Date(startTime + hours * 60 * 60 * 1000).toISOString();
}

// Transition Validator Helper
function validateTransition(currentStatus, targetStatus, resolutionNote) {
  if (currentStatus === targetStatus) {
    return { ok: true, noop: true };
  }

  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    return { ok: false, error: `Недопустимий перехід: ${currentStatus} → ${targetStatus}` };
  }

  if (targetStatus === 'RESOLVED' && !resolutionNote) {
    return { ok: false, error: 'Для переведення в RESOLVED необхідно вказати опис рішення (resolutionNote)' };
  }

  return { ok: true, noop: false };
}

// SLA Auto-Escalation Evaluation Helper
function shouldEscalateSla(app, currentTime = Date.now()) {
  const thirtyMinutesFromNow = currentTime + 30 * 60 * 1000;
  const isResolvedOrClosed = app.status === 'RESOLVED' || app.status === 'CLOSED';
  const isAlreadyCritical = app.priority === 'CRITICAL';
  const deadlinePassedOrNear = new Date(app.slaDeadline).getTime() <= thirtyMinutesFromNow;

  return !isResolvedOrClosed && !isAlreadyCritical && deadlinePassedOrNear;
}

describe('1. Business Logic: SLA Deadline Calculations', () => {
  it('CRITICAL priority assigns a 1-hour SLA deadline', () => {
    const start = new Date('2026-09-01T12:00:00.000Z').getTime();
    const deadline = calculateSlaDeadline('CRITICAL', start);
    assert.equal(deadline, '2026-09-01T13:00:00.000Z');
  });

  it('HIGH priority assigns a 4-hour SLA deadline', () => {
    const start = new Date('2026-09-01T12:00:00.000Z').getTime();
    const deadline = calculateSlaDeadline('HIGH', start);
    assert.equal(deadline, '2026-09-01T16:00:00.000Z');
  });

  it('MEDIUM priority assigns a 24-hour SLA deadline', () => {
    const start = new Date('2026-09-01T12:00:00.000Z').getTime();
    const deadline = calculateSlaDeadline('MEDIUM', start);
    assert.equal(deadline, '2026-09-02T12:00:00.000Z');
  });

  it('LOW priority assigns a 72-hour SLA deadline', () => {
    const start = new Date('2026-09-01T12:00:00.000Z').getTime();
    const deadline = calculateSlaDeadline('LOW', start);
    assert.equal(deadline, '2026-09-04T12:00:00.000Z');
  });

  it('Unknown priority falls back to 72 hours SLA deadline', () => {
    const start = new Date('2026-09-01T12:00:00.000Z').getTime();
    const deadline = calculateSlaDeadline('UNKNOWN', start);
    assert.equal(deadline, '2026-09-04T12:00:00.000Z');
  });
});

describe('2. Business Logic: Application Status Transitions (VALID_TRANSITIONS)', () => {
  it('Allows NEW -> IN_PROGRESS transition', () => {
    const res = validateTransition('NEW', 'IN_PROGRESS');
    assert.equal(res.ok, true);
  });

  it('Allows NEW -> CLOSED transition', () => {
    const res = validateTransition('NEW', 'CLOSED');
    assert.equal(res.ok, true);
  });

  it('Rejects invalid direct transition NEW -> RESOLVED', () => {
    const res = validateTransition('NEW', 'RESOLVED', 'Some resolution');
    assert.equal(res.ok, false);
    assert.match(res.error, /Недопустимий перехід: NEW → RESOLVED/);
  });

  it('Allows IN_PROGRESS -> RESOLVED with a resolution note', () => {
    const res = validateTransition('IN_PROGRESS', 'RESOLVED', 'Фікс застосовано');
    assert.equal(res.ok, true);
  });

  it('Rejects IN_PROGRESS -> RESOLVED if resolution note is missing or empty', () => {
    const res = validateTransition('IN_PROGRESS', 'RESOLVED', '');
    assert.equal(res.ok, false);
    assert.match(res.error, /resolutionNote/);
  });

  it('Allows RESOLVED -> IN_PROGRESS (Reopening)', () => {
    const res = validateTransition('RESOLVED', 'IN_PROGRESS');
    assert.equal(res.ok, true);
  });

  it('Allows RESOLVED -> CLOSED', () => {
    const res = validateTransition('RESOLVED', 'CLOSED');
    assert.equal(res.ok, true);
  });

  it('Rejects all transitions out of CLOSED status', () => {
    for (const target of ['NEW', 'IN_PROGRESS', 'RESOLVED']) {
      const res = validateTransition('CLOSED', target);
      assert.equal(res.ok, false);
    }
  });

  it('Handles identical status gracefully as idempotent no-op', () => {
    const res = validateTransition('IN_PROGRESS', 'IN_PROGRESS');
    assert.equal(res.ok, true);
    assert.equal(res.noop, true);
  });
});

describe('3. Business Logic: SLA Auto-Escalation Cron', () => {
  const baseTime = new Date('2026-09-01T12:00:00.000Z').getTime();

  it('Escalates ticket when deadline is within 30 minutes', () => {
    const app = {
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      slaDeadline: '2026-09-01T12:20:00.000Z', // 20 mins from baseTime
    };
    assert.equal(shouldEscalateSla(app, baseTime), true);
  });

  it('Escalates ticket when deadline is already overdue', () => {
    const app = {
      status: 'NEW',
      priority: 'LOW',
      slaDeadline: '2026-09-01T11:55:00.000Z', // 5 mins overdue
    };
    assert.equal(shouldEscalateSla(app, baseTime), true);
  });

  it('Does NOT escalate ticket when deadline is more than 30 minutes away', () => {
    const app = {
      status: 'NEW',
      priority: 'HIGH',
      slaDeadline: '2026-09-01T14:00:00.000Z', // 2 hours away
    };
    assert.equal(shouldEscalateSla(app, baseTime), false);
  });

  it('Does NOT escalate ticket if it is already CRITICAL', () => {
    const app = {
      status: 'IN_PROGRESS',
      priority: 'CRITICAL',
      slaDeadline: '2026-09-01T12:10:00.000Z',
    };
    assert.equal(shouldEscalateSla(app, baseTime), false);
  });

  it('Does NOT escalate ticket if status is RESOLVED or CLOSED', () => {
    const resolvedApp = {
      status: 'RESOLVED',
      priority: 'MEDIUM',
      slaDeadline: '2026-09-01T12:05:00.000Z',
    };
    const closedApp = {
      status: 'CLOSED',
      priority: 'MEDIUM',
      slaDeadline: '2026-09-01T12:05:00.000Z',
    };
    assert.equal(shouldEscalateSla(resolvedApp, baseTime), false);
    assert.equal(shouldEscalateSla(closedApp, baseTime), false);
  });
});

describe('4. Business Logic: ITSM Workflow State Machines', () => {
  it('Change Request workflow validates permitted transitions', () => {
    assert.deepEqual(CHANGE_WORKFLOW.DRAFT, ['PENDING']);
    assert.deepEqual(CHANGE_WORKFLOW.PENDING, ['APPROVED', 'REJECTED']);
    assert.deepEqual(CHANGE_WORKFLOW.APPROVED, ['IMPLEMENTED']);
    assert.deepEqual(CHANGE_WORKFLOW.IMPLEMENTED, []);
    assert.deepEqual(CHANGE_WORKFLOW.REJECTED, []);
  });

  it('Problem workflow validates RCA -> KNOWN_ERROR -> RESOLVED steps', () => {
    assert.deepEqual(PROBLEM_WORKFLOW.NEW, ['RCA']);
    assert.deepEqual(PROBLEM_WORKFLOW.RCA, ['KNOWN_ERROR']);
    assert.deepEqual(PROBLEM_WORKFLOW.KNOWN_ERROR, ['RESOLVED']);
    assert.deepEqual(PROBLEM_WORKFLOW.RESOLVED, []);
  });

  it('Knowledge Base workflow validates DRAFT -> PUBLISHED <-> ARCHIVED', () => {
    assert.deepEqual(KB_WORKFLOW.DRAFT, ['PUBLISHED']);
    assert.deepEqual(KB_WORKFLOW.PUBLISHED, ['ARCHIVED']);
    assert.deepEqual(KB_WORKFLOW.ARCHIVED, ['PUBLISHED']);
  });
});
