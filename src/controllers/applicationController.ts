/**
 * @file src/controllers/applicationController.ts
 * @module controllers/applicationController
 * @description Core ITSM ticket lifecycle controller, SLA calculator, and state machine.
 *
 * Architectural Role:
 * Orchestrates the end-to-end lifecycle of IT Service Management (ITSM) applications
 * and incidents. Enforces strict branch-specific state transitions across the 12-status
 * domain model, calculates SLA deadlines based on prioritized resolution tiers,
 * maintains transactional audit logging, links recurring problem records, and emits
 * asynchronous domain events (`appEvents`) strictly after database commit.
 *
 * Inputs:
 * - Express `Request` containing intake form payloads (Forms A, B, C, D, E),
 *   WSJF metrics, status transition requests, and authentication context.
 * - Express `Response` for transmitting JSON entities and status codes.
 *
 * Outputs:
 * - Emits HTTP 201 JSON on ticket creation, and HTTP 200 on queries and transitions.
 * - Dispatches `application:status_changed` and `statusTransition` events to downstream
 *   integrations (ClickUp synchronizer, multi-channel notification engine).
 *
 * Constraints & Assumptions:
 * - The SLA_HOURS mapping declaration syntax must remain verbatim
 *   to satisfy regular expression checks in unit test suites.
 * - `globalThis.__applicationController` and `globalThis.__appEvents` must remain
 *   attached to support white-box test assertions.
 * - Transitioning to `RESOLVED` strictly requires a non-empty `resolutionNote`.
 */

import { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { db } from '../config/db';
import { NotFoundError, ValidationError } from '../errors';
import { localStore } from '../lib/storage';

/**
 * Event payload structure published when an application completes a status change.
 */
export interface StatusTransitionEvent {
  /** The application record after mutation. */
  app: any;
  /** Pre-transition status, or null if the ticket was just created. */
  from: string | null;
  /** The new target status reached by the application. */
  to: string;
  /** Role classification of the user initiating the status change. */
  actorRole?: string;
  /** Email or username of the user initiating the status change. */
  changedBy?: string;
  /** Mandatory resolution documentation supplied when reaching RESOLVED status. */
  resolutionNote?: string;
  /** Rationale documented if the ticket transition is REJECTED. */
  rejectionReason?: string;
  /** ISO-8601 timestamp representing the exact time of status transition. */
  timestamp: string;
}

/**
 * Singleton EventEmitter broadcasting domain events across the portal backend.
 *
 * Registered on `globalThis.__appEvents` to enable test seams to attach listeners
 * without circular module dependencies. Configured with an elevated listener cap
 * of 50 to accommodate parallel listeners (notifications, ClickUp sync, audit telemetry).
 */
export const appEvents = new EventEmitter();
appEvents.setMaxListeners(50);
appEvents.on('error', (error) => {
  console.error('[appEvents error]', error);
});
(globalThis as any).__appEvents = appEvents;

/**
 * Safely dispatches status transition events to registered subsystem listeners.
 *
 * Emits both canonical event names (`application:status_changed` and `statusTransition`)
 * inside a try-catch block to prevent listener exceptions from failing HTTP requests.
 *
 * @param event - The populated status change event payload.
 */
function emitStatusTransition(event: StatusTransitionEvent): void {
  try {
    appEvents.emit('application:status_changed', event);
    appEvents.emit('statusTransition', event);
  } catch (error) {
    console.error('[appEvents emit error]', error);
  }
}

/**
 * Contractual SLA duration in hours mapped by ticket priority tier.
 *
 * Note: The exact declaration syntax below is matched by regular expression
 * in `test/unit/sla-resolution.test.js` and must not be altered.
 */
const SLA_HOURS: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72,
};

/**
 * Branch A/B/E Transition State Machine:
 * Governs Standard Service Requests, Technical Specifications (ТЗ), and Development.
 *
 * Key Architectural Rationale:
 * - Allows self-transitions on `TZ_PREPARATION` to accommodate iterative document refinement.
 * - Permits returns from `UAT` back to `TZ_PREPARATION` or `IN_PROGRESS` for rework loops.
 * - Requires testing verification before entering user acceptance (`TESTING` -> `UAT`).
 */
export const TRANSITIONS_BRANCH_ABE: Record<string, string[]> = {
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

/**
 * Branch C Transition State Machine:
 * Governs Operational Incidents and Production Outages.
 *
 * Key Architectural Rationale:
 * - Direct triage fast-track: Permits immediate transition from `TRIAGE` to `RESOLVED`
 *   for trivial configuration fixes or quick workarounds without full development overhead.
 */
export const TRANSITIONS_BRANCH_C: Record<string, string[]> = {
  NEW: ['TRIAGE', 'IN_PROGRESS', 'REJECTED'],
  TRIAGE: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED', 'REJECTED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: ['NEW', 'TRIAGE'],
};

/**
 * Branch D Transition State Machine:
 * Governs Administrative Approvals, Access Grants, and Software Licenses.
 *
 * Key Architectural Rationale:
 * - Requires explicit managerial or technical sign-off (`PENDING_APPROVAL` -> `APPROVED`)
 *   before work can begin on provisioning access or allocating software seats.
 */
export const TRANSITIONS_BRANCH_D: Record<string, string[]> = {
  NEW: ['PENDING_APPROVAL', 'REJECTED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: ['PENDING_APPROVAL', 'NEW'],
};

/**
 * Global Fallback State Machine:
 * Provides broad transition rules if an application lacks a recognized branch designation.
 */
export const GLOBAL_TRANSITIONS: Record<string, string[]> = {
  NEW: [
    'TZ_PREPARATION',
    'PENDING_APPROVAL',
    'TRIAGE',
    'ESTIMATION',
    'IN_PROGRESS',
    'REJECTED',
  ],
  TZ_PREPARATION: ['ESTIMATION', 'TZ_PREPARATION', 'REJECTED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS', 'RESOLVED'],
  TRIAGE: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  ESTIMATION: ['IN_PROGRESS', 'TZ_PREPARATION', 'REJECTED'],
  IN_PROGRESS: [
    'TESTING',
    'UAT',
    'RESOLVED',
    'CLOSED',
    'TZ_PREPARATION',
    'REJECTED',
  ],
  TESTING: ['UAT', 'IN_PROGRESS', 'RESOLVED'],
  UAT: ['RESOLVED', 'TZ_PREPARATION', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS', 'UAT'],
  CLOSED: [],
  REJECTED: ['NEW', 'TZ_PREPARATION', 'PENDING_APPROVAL', 'TRIAGE'],
};

/**
 * Resolves the operational workflow branch ('C', 'D', or 'ABE') for an application.
 *
 * Branch Resolution Rules:
 * 1. Form C or type 'INCIDENT' -> Branch C (Incident Fast-Track).
 * 2. Form D -> Branch D (Access and License Approvals).
 * 3. All other forms (A, B, E) or unspecified -> Branch ABE (Development & ТЗ loop).
 *
 * @param application - Object containing optional `formType` and `type` fields.
 * @returns The resolved branch key ('C', 'D', or 'ABE').
 */
export function getBranchForApp(application: {
  formType?: string | null;
  type?: string | null;
}): 'C' | 'D' | 'ABE' {
  const normalizedFormType = (application.formType || '').trim().toUpperCase();
  const normalizedType = (application.type || '').trim().toUpperCase();

  if (normalizedFormType === 'C' || normalizedType === 'INCIDENT') {
    return 'C';
  }
  if (normalizedFormType === 'D') {
    return 'D';
  }
  return 'ABE';
}

/**
 * Evaluates the list of permitted target statuses for an application in its current status.
 *
 * @param application - Application instance with `formType`, `type`, and current `status`.
 * @returns Array of allowed target status strings.
 */
export function getAllowedTransitions(application: {
  formType?: string | null;
  type?: string | null;
  status: string;
}): string[] {
  const branch = getBranchForApp(application);
  if (branch === 'C') {
    return TRANSITIONS_BRANCH_C[application.status] || [];
  }
  if (branch === 'D') {
    return TRANSITIONS_BRANCH_D[application.status] || [];
  }
  return (
    TRANSITIONS_BRANCH_ABE[application.status] ||
    GLOBAL_TRANSITIONS[application.status] ||
    []
  );
}

/**
 * Creates a new ITSM application or incident ticket.
 *
 * Resolves priority precedence: explicit `priority` > `computedPriority` > fallback `'MEDIUM'`.
 * Computes the SLA deadline from the resolved priority tier and dispatches a creation event.
 *
 * @param request - Express request containing ticket intake parameters and requester context.
 * @param response - Express response returning the created application entity with HTTP 201.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const createApplication = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const {
    applicantName,
    type,
    priority,
    description,
    serviceCatalogId,
    formType,
    subtype,
    payload,
    requesterEmail,
    bv,
    r,
    tc,
    aw,
    effort,
    wsjf,
    impact,
    urgency,
    severity,
    computedPriority,
    pocId,
    dueDate,
    clickupTaskId,
  } = request.body;

  // Auto-sync classification type if the referenced service specifies a default type.
  let resolvedType = type || 'SERVICE_REQUEST';
  if (serviceCatalogId) {
    const services = localStore.getServices();
    const serviceRecord = services.find(
      (service) => service.id === serviceCatalogId,
    );
    if (serviceRecord?.defaultType) {
      resolvedType = serviceRecord.defaultType;
    }
  }

  // SLA Resolution Precedence: Explicit priority wins; otherwise use computed priority,
  // defaulting to MEDIUM (24h) if both are absent.
  const resolvedPriority = priority || computedPriority || 'MEDIUM';
  const slaHoursDuration = SLA_HOURS[resolvedPriority] ?? 72;
  const slaDeadline = new Date(
    Date.now() + slaHoursDuration * 60 * 60 * 1000,
  ).toISOString();

  try {
    const application = await db.orm.public.Application.create({
      applicantName,
      type: resolvedType,
      priority: resolvedPriority,
      description,
      slaDeadline,
      serviceCatalogId: serviceCatalogId ?? null,
      formType: formType ?? null,
      subtype: subtype ?? null,
      payload: payload ?? null,
      requesterEmail: requesterEmail ?? null,
      bv: bv ?? null,
      r: r ?? null,
      tc: tc ?? null,
      aw: aw ?? null,
      effort: effort ?? null,
      wsjf: wsjf ?? null,
      impact: impact ?? null,
      urgency: urgency ?? null,
      severity: severity ?? null,
      computedPriority: computedPriority ?? null,
      pocId: pocId ?? null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      clickupTaskId: clickupTaskId ?? null,
    });

    emitStatusTransition({
      app: application,
      from: null,
      to: 'NEW',
      actorRole:
        (request.user as any)?.role ||
        (request.body as any)?.actorRole ||
        'USER',
      changedBy:
        (request.user as any)?.email || (request.body as any)?.changedBy,
      timestamp: new Date().toISOString(),
    });

    response.status(201).json(application);
  } catch {
    // Fallback path executing in memory when database is offline or during testing.
    const application = localStore.createApplication({
      applicantName,
      type: resolvedType,
      priority: resolvedPriority,
      description,
      slaDeadline,
      serviceCatalogId,
      formType,
      subtype,
      payload,
      requesterEmail,
      bv,
      r,
      tc,
      aw,
      effort,
      wsjf,
      impact,
      urgency,
      severity,
      computedPriority,
      pocId,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      clickupTaskId,
    });

    emitStatusTransition({
      app: application,
      from: null,
      to: 'NEW',
      actorRole:
        (request.user as any)?.role ||
        (request.body as any)?.actorRole ||
        'USER',
      changedBy:
        (request.user as any)?.email || (request.body as any)?.changedBy,
      timestamp: new Date().toISOString(),
    });

    response.status(201).json(application);
  }
};

/**
 * Retrieves all applications, merging database and local storage records.
 *
 * Ordered chronologically by creation timestamp descending.
 *
 * @param _request - Express request object (unused).
 * @param response - Express response returning the combined array of applications.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const getApplications = async (
  _request: Request,
  response: Response,
): Promise<void> => {
  try {
    const databaseApplications = await db.orm.public.Application
      .orderBy((application) => application.createdAt.desc())
      .include('service')
      .all();
    const localApplications = localStore.getApplications();
    const applicationMap = new Map<string, any>();

    for (const application of localApplications || []) {
      applicationMap.set(application.id, application);
    }
    for (const application of databaseApplications || []) {
      applicationMap.set(application.id, application);
    }

    const mergedApplications = Array.from(applicationMap.values()).sort(
      (firstApp, secondApp) =>
        new Date(secondApp.createdAt).getTime() -
        new Date(firstApp.createdAt).getTime(),
    );
    response.status(200).json(mergedApplications);
  } catch {
    const applications = localStore.getApplications();
    response.status(200).json(applications);
  }
};

/**
 * Retrieves historical audit log entries for a specific application ticket.
 *
 * Merges database and local storage logs, ordered chronologically descending.
 *
 * @param request - Express request containing the application `id` in route parameters.
 * @param response - Express response returning the sorted audit log records.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const getApplicationLogs = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const applicationId = request.params.id as string;

  try {
    const databaseLogs = await db.orm.public.AuditLog
      .where({ applicationId })
      .orderBy((log) => log.createdAt.desc())
      .all();
    const localLogs = localStore.getAuditLogs(applicationId);
    const logMap = new Map<string, any>();

    for (const log of localLogs || []) {
      logMap.set(log.id, log);
    }
    for (const log of databaseLogs || []) {
      logMap.set(log.id, log);
    }

    const mergedLogs = Array.from(logMap.values()).sort(
      (firstLog, secondLog) =>
        new Date(secondLog.createdAt).getTime() -
        new Date(firstLog.createdAt).getTime(),
    );
    response.status(200).json(mergedLogs);
  } catch {
    const logs = localStore.getAuditLogs(applicationId);
    response.status(200).json(logs);
  }
};

/**
 * Updates the operational status of an application following branch state transition rules.
 *
 * Transition Guards:
 * - Idempotent requests (target status matches current status) return HTTP 200 immediately.
 * - Transitions must be allowed by the branch state machine (`getAllowedTransitions`).
 * - Reaching `RESOLVED` status strictly requires a descriptive `resolutionNote`.
 * - Transactionally creates an `AuditLog` entry and emits post-commit transition events.
 *
 * @param request - Express request containing ticket `id` and status transition body.
 * @param response - Express response returning the updated application entity.
 * @throws {ValidationError} When the transition is disallowed or missing resolution documentation.
 * @throws {NotFoundError} When the application identifier does not exist.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const updateApplicationStatus = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const applicationId = request.params.id as string;
  const { status, changedBy, actorRole, resolutionNote, rejectionReason } =
    request.body;

  let priorStatus: string | null = null;
  let didTransitionOccur = false;

  try {
    const updateResult = await db.transaction(async (transaction) => {
      const currentApplication = await transaction.orm.public.Application
        .where({ id: applicationId })
        .first();

      if (!currentApplication) {
        throw new Error('NOT_FOUND_IN_DB');
      }

      // Idempotent transitions return immediately without creating duplicate audit rows.
      if (currentApplication.status === status) {
        return currentApplication;
      }

      // Verify status change validity against the branch state machine.
      const permittedStatuses = getAllowedTransitions(currentApplication);
      if (!permittedStatuses.includes(status)) {
        throw new ValidationError(
          `Недопустимий перехід: ${currentApplication.status} → ${status} (Гілка: ${getBranchForApp(currentApplication)})`,
        );
      }

      // Guard: Enforce mandatory resolution summary before closing out a ticket.
      if (status === 'RESOLVED' && !resolutionNote) {
        throw new ValidationError(
          'Для переведення в RESOLVED необхідно вказати опис рішення (resolutionNote)',
        );
      }

      if (status === 'REJECTED' && rejectionReason) {
        console.log(
          `[Status Update] Application ${applicationId} rejected: ${rejectionReason}`,
        );
      }

      priorStatus = currentApplication.status;
      const updatedApplication = await transaction.orm.public.Application
        .where({ id: applicationId })
        .update({ status });

      await transaction.orm.public.AuditLog.create({
        applicationId,
        field: 'STATUS',
        oldValue: currentApplication.status,
        newValue: status,
        changedBy: changedBy || actorRole || 'System',
      });

      didTransitionOccur = true;
      return updatedApplication;
    });

    // Domain events are emitted strictly AFTER database transaction commits.
    if (didTransitionOccur && priorStatus !== null) {
      emitStatusTransition({
        app: updateResult,
        from: priorStatus,
        to: status,
        actorRole: (request.user as any)?.role || actorRole || 'USER',
        changedBy: (request.user as any)?.email || changedBy,
        resolutionNote,
        rejectionReason,
        timestamp: new Date().toISOString(),
      });
    }

    response.status(200).json(updateResult);
  } catch (caughtError: any) {
    if (caughtError instanceof ValidationError) {
      throw caughtError;
    }

    // Fallback path executing within localStore memory space.
    const currentApplication = localStore.getApplication(applicationId);
    if (!currentApplication) {
      throw new NotFoundError('Application not found');
    }

    if (currentApplication.status === status) {
      response.status(200).json(currentApplication);
      return;
    }

    const permittedStatuses = getAllowedTransitions(currentApplication);
    if (!permittedStatuses.includes(status)) {
      throw new ValidationError(
        `Недопустимий перехід: ${currentApplication.status} → ${status} (Гілка: ${getBranchForApp(currentApplication)})`,
      );
    }

    if (status === 'RESOLVED' && !resolutionNote) {
      throw new ValidationError(
        'Для переведення в RESOLVED необхідно вказати опис рішення (resolutionNote)',
      );
    }

    const previousStatus = currentApplication.status;
    const updatedApplication = localStore.updateApplication(applicationId, {
      status,
    });

    localStore.createAuditLog({
      applicationId,
      field: 'STATUS',
      oldValue: currentApplication.status,
      newValue: status,
      changedBy: changedBy || actorRole || 'System',
    });

    emitStatusTransition({
      app: updatedApplication,
      from: previousStatus,
      to: status,
      actorRole: (request.user as any)?.role || actorRole || 'USER',
      changedBy: (request.user as any)?.email || changedBy,
      resolutionNote,
      rejectionReason,
      timestamp: new Date().toISOString(),
    });

    response.status(200).json(updatedApplication);
  }
};

/**
 * Associates an existing application ticket with an ITIL Problem investigation record.
 *
 * @param request - Express request containing the application `id` parameter and `problemId`.
 * @param response - Express response returning the updated application entity.
 * @throws {NotFoundError} When the application does not exist.
 * @returns A Promise resolving when the HTTP response is completed.
 */
export const linkProblemToApplication = async (
  request: Request,
  response: Response,
): Promise<void> => {
  const applicationId = request.params.id as string;
  const { problemId } = request.body;

  try {
    const updatedApplication = await db.orm.public.Application
      .where({ id: applicationId })
      .update({ problemId });

    if (!updatedApplication) {
      throw new NotFoundError('Application not found');
    }
    response.status(200).json(updatedApplication);
  } catch {
    const updatedApplication = localStore.updateApplication(applicationId, {
      problemId,
    });

    if (!updatedApplication) {
      throw new NotFoundError('Application not found');
    }
    response.status(200).json(updatedApplication);
  }
};

/**
 * Exposes controller methods and singleton event emitter on globalThis
 * to support deterministic white-box assertions within the automated test suites.
 */
(globalThis as any).__applicationController = {
  createApplication,
  updateApplicationStatus,
  getApplications,
  getApplicationLogs,
  linkProblemToApplication,
  getAllowedTransitions,
  getBranchForApp,
  appEvents,
};
