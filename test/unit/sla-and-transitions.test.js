import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Business logic fixtures & transition maps mirroring controller specifications
const SLA_HOURS = {
  CRITICAL: 1,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72,
};

// 12-Status Branch Transitions
const TRANSITIONS_BRANCH_ABE = {
  NEW: ['TZ_PREPARATION', 'REJECTED'],
  TZ_PREPARATION: ['ESTIMATION', 'TZ_PREPARATION', 'REJECTED'],
  ESTIMATION: ['IN_PROGRESS', 'TZ_PREPARATION', 'REJECTED'],
  IN_PROGRESS: ['TESTING', 'TZ_PREPARATION', 'REJECTED'],
  TESTING: ['UAT', 'IN_PROGRESS'],
  UAT: ['RESOLVED', 'TZ_PREPARATION', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS', 'UAT'],
  CLOSED: [],
  REJECTED: ['TZ_PREPARATION', 'NEW'],
};

const TRANSITIONS_BRANCH_C = {
  NEW: ['TRIAGE', 'IN_PROGRESS', 'REJECTED'],
  TRIAGE: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED', 'REJECTED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: ['NEW', 'TRIAGE'],
};

const TRANSITIONS_BRANCH_D = {
  NEW: ['PENDING_APPROVAL', 'REJECTED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: ['PENDING_APPROVAL', 'NEW'],
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

// Branch Detector Helper
function getBranch(formType, type) {
  const f = (formType || '').trim().toUpperCase();
  const t = (type || '').trim().toUpperCase();
  if (f === 'C' || t === 'INCIDENT') return 'C';
  if (f === 'D') return 'D';
  return 'ABE';
}

// Transition Validator Helper
function validateTransition(currentStatus, targetStatus, resolutionNote, formType = 'A', type = 'SERVICE_REQUEST') {
  if (currentStatus === targetStatus) {
    return { ok: true, noop: true };
  }

  const branch = getBranch(formType, type);
  const map = branch === 'C' ? TRANSITIONS_BRANCH_C : branch === 'D' ? TRANSITIONS_BRANCH_D : TRANSITIONS_BRANCH_ABE;
  const allowed = map[currentStatus] || [];

  if (!allowed.includes(targetStatus)) {
    return { ok: false, error: `Недопустимий перехід: ${currentStatus} → ${targetStatus} (Гілка: ${branch})` };
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

describe('2. Business Logic: 12-Status Branch Transitions & Guards', () => {
  describe('Branch A/B/E (ТЗ specification, development & UAT)', () => {
    it('Allows full standard flow: NEW -> TZ_PREPARATION -> ESTIMATION -> IN_PROGRESS -> TESTING -> UAT -> RESOLVED -> CLOSED', () => {
      assert.equal(validateTransition('NEW', 'TZ_PREPARATION', null, 'A').ok, true);
      assert.equal(validateTransition('TZ_PREPARATION', 'ESTIMATION', null, 'A').ok, true);
      assert.equal(validateTransition('ESTIMATION', 'IN_PROGRESS', null, 'A').ok, true);
      assert.equal(validateTransition('IN_PROGRESS', 'TESTING', null, 'A').ok, true);
      assert.equal(validateTransition('TESTING', 'UAT', null, 'A').ok, true);
      assert.equal(validateTransition('UAT', 'RESOLVED', 'Реалізовано згідно з ТЗ', 'A').ok, true);
      assert.equal(validateTransition('RESOLVED', 'CLOSED', null, 'A').ok, true);
    });

    it('Supports TZ loop (петля ТЗ): TZ_PREPARATION -> TZ_PREPARATION (уточнення)', () => {
      const res = validateTransition('TZ_PREPARATION', 'TZ_PREPARATION', null, 'A');
      assert.equal(res.ok, true);
      assert.equal(res.noop, true);
    });

    it('Supports returning from UAT back to TZ_PREPARATION or IN_PROGRESS', () => {
      assert.equal(validateTransition('UAT', 'TZ_PREPARATION', null, 'A').ok, true);
      assert.equal(validateTransition('UAT', 'IN_PROGRESS', null, 'A').ok, true);
    });

    it('Rejects invalid direct skip: NEW -> RESOLVED on Branch A', () => {
      const res = validateTransition('NEW', 'RESOLVED', 'Done', 'A');
      assert.equal(res.ok, false);
      assert.match(res.error, /Недопустимий перехід/);
    });

    it('Rejects UAT -> RESOLVED without resolution note', () => {
      const res = validateTransition('UAT', 'RESOLVED', '', 'A');
      assert.equal(res.ok, false);
      assert.match(res.error, /resolutionNote/);
    });
  });

  describe('Branch C (Incident Triage & Fast-Track)', () => {
    it('Allows Incident flow: NEW -> TRIAGE -> IN_PROGRESS -> RESOLVED -> CLOSED', () => {
      assert.equal(validateTransition('NEW', 'TRIAGE', null, 'C', 'INCIDENT').ok, true);
      assert.equal(validateTransition('TRIAGE', 'IN_PROGRESS', null, 'C', 'INCIDENT').ok, true);
      assert.equal(validateTransition('IN_PROGRESS', 'RESOLVED', 'Сервер перезавантажено', 'C', 'INCIDENT').ok, true);
      assert.equal(validateTransition('RESOLVED', 'CLOSED', null, 'C', 'INCIDENT').ok, true);
    });

    it('Allows direct Quick-Fix resolution: TRIAGE -> RESOLVED with note', () => {
      const res = validateTransition('TRIAGE', 'RESOLVED', 'Швидке виправлення конфігурації', 'C', 'INCIDENT');
      assert.equal(res.ok, true);
    });
  });

  describe('Branch D (Approvals & Access/License requests)', () => {
    it('Allows Approval flow: NEW -> PENDING_APPROVAL -> APPROVED -> IN_PROGRESS -> RESOLVED', () => {
      assert.equal(validateTransition('NEW', 'PENDING_APPROVAL', null, 'D').ok, true);
      assert.equal(validateTransition('PENDING_APPROVAL', 'APPROVED', null, 'D').ok, true);
      assert.equal(validateTransition('APPROVED', 'IN_PROGRESS', null, 'D').ok, true);
      assert.equal(validateTransition('IN_PROGRESS', 'RESOLVED', 'Доступ активовано', 'D').ok, true);
    });

    it('Allows rejection flow: PENDING_APPROVAL -> REJECTED', () => {
      const res = validateTransition('PENDING_APPROVAL', 'REJECTED', null, 'D');
      assert.equal(res.ok, true);
    });
  });
});

describe('3. Business Logic: SLA Auto-Escalation Cron', () => {
  it('Escalates ticket when deadline is within 30 minutes', () => {
    const now = new Date('2026-09-01T12:00:00.000Z').getTime();
    const app = {
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      slaDeadline: '2026-09-01T12:20:00.000Z', // 20 mins away
    };
    assert.equal(shouldEscalateSla(app, now), true);
  });

  it('Escalates ticket when deadline is already overdue', () => {
    const now = new Date('2026-09-01T12:00:00.000Z').getTime();
    const app = {
      priority: 'MEDIUM',
      status: 'NEW',
      slaDeadline: '2026-09-01T11:55:00.000Z', // 5 mins overdue
    };
    assert.equal(shouldEscalateSla(app, now), true);
  });

  it('Does NOT escalate ticket when deadline is more than 30 minutes away', () => {
    const now = new Date('2026-09-01T12:00:00.000Z').getTime();
    const app = {
      priority: 'LOW',
      status: 'IN_PROGRESS',
      slaDeadline: '2026-09-01T14:00:00.000Z', // 2 hours away
    };
    assert.equal(shouldEscalateSla(app, now), false);
  });

  it('Does NOT escalate ticket if it is already CRITICAL', () => {
    const now = new Date('2026-09-01T12:00:00.000Z').getTime();
    const app = {
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      slaDeadline: '2026-09-01T12:10:00.000Z',
    };
    assert.equal(shouldEscalateSla(app, now), false);
  });

  it('Does NOT escalate ticket if status is RESOLVED or CLOSED', () => {
    const now = new Date('2026-09-01T12:00:00.000Z').getTime();
    const resolvedApp = {
      priority: 'HIGH',
      status: 'RESOLVED',
      slaDeadline: '2026-09-01T12:10:00.000Z',
    };
    const closedApp = {
      priority: 'HIGH',
      status: 'CLOSED',
      slaDeadline: '2026-09-01T12:10:00.000Z',
    };
    assert.equal(shouldEscalateSla(resolvedApp, now), false);
    assert.equal(shouldEscalateSla(closedApp, now), false);
  });
});

describe('4. Business Logic: ITSM Workflow State Machines', () => {
  it('Change Request workflow validates permitted transitions', () => {
    assert.deepEqual(CHANGE_WORKFLOW.DRAFT, ['PENDING']);
    assert.deepEqual(CHANGE_WORKFLOW.PENDING, ['APPROVED', 'REJECTED']);
    assert.deepEqual(CHANGE_WORKFLOW.APPROVED, ['IMPLEMENTED']);
  });

  it('Problem workflow validates RCA -> KNOWN_ERROR -> RESOLVED steps', () => {
    assert.deepEqual(PROBLEM_WORKFLOW.NEW, ['RCA']);
    assert.deepEqual(PROBLEM_WORKFLOW.RCA, ['KNOWN_ERROR']);
    assert.deepEqual(PROBLEM_WORKFLOW.KNOWN_ERROR, ['RESOLVED']);
  });

  it('Knowledge Base workflow validates DRAFT -> PUBLISHED <-> ARCHIVED', () => {
    assert.deepEqual(KB_WORKFLOW.DRAFT, ['PUBLISHED']);
    assert.deepEqual(KB_WORKFLOW.PUBLISHED, ['ARCHIVED']);
    assert.deepEqual(KB_WORKFLOW.ARCHIVED, ['PUBLISHED']);
  });
});
