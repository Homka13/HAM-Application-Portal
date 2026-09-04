import { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { db } from '../config/db';
import { NotFoundError, ValidationError } from '../errors';
import { localStore } from '../lib/storage';

export interface StatusTransitionEvent {
  app: any;
  from: string | null;
  to: string;
  actorRole?: string;
  changedBy?: string;
  resolutionNote?: string;
  rejectionReason?: string;
  timestamp: string;
}

export const appEvents = new EventEmitter();
appEvents.setMaxListeners(50);
appEvents.on('error', (err) => {
  console.error('[appEvents error]', err);
});
(globalThis as any).__appEvents = appEvents;

function emitStatusTransition(event: StatusTransitionEvent): void {
  try {
    appEvents.emit('application:status_changed', event);
    appEvents.emit('statusTransition', event);
  } catch (err) {
    console.error('[appEvents emit error]', err);
  }
}

const SLA_HOURS: Record<string, number> = {
  CRITICAL: 1,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72,
};

// Branch A/B/E: ТЗ Loop, Estimation, Development, Testing, UAT, Resolution, Closure
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

// Branch C: Incident Triage & Resolution
export const TRANSITIONS_BRANCH_C: Record<string, string[]> = {
  NEW: ['TRIAGE', 'IN_PROGRESS', 'REJECTED'],
  TRIAGE: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED', 'REJECTED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: ['NEW', 'TRIAGE'],
};

// Branch D: Approval Lifecycle (Доступи, Ліцензії)
export const TRANSITIONS_BRANCH_D: Record<string, string[]> = {
  NEW: ['PENDING_APPROVAL', 'REJECTED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: ['PENDING_APPROVAL', 'NEW'],
};

// Global fallback transitions map
export const GLOBAL_TRANSITIONS: Record<string, string[]> = {
  NEW: ['TZ_PREPARATION', 'PENDING_APPROVAL', 'TRIAGE', 'ESTIMATION', 'IN_PROGRESS', 'REJECTED'],
  TZ_PREPARATION: ['ESTIMATION', 'TZ_PREPARATION', 'REJECTED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS', 'RESOLVED'],
  TRIAGE: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  ESTIMATION: ['IN_PROGRESS', 'TZ_PREPARATION', 'REJECTED'],
  IN_PROGRESS: ['TESTING', 'UAT', 'RESOLVED', 'CLOSED', 'TZ_PREPARATION', 'REJECTED'],
  TESTING: ['UAT', 'IN_PROGRESS', 'RESOLVED'],
  UAT: ['RESOLVED', 'TZ_PREPARATION', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS', 'UAT'],
  CLOSED: [],
  REJECTED: ['NEW', 'TZ_PREPARATION', 'PENDING_APPROVAL', 'TRIAGE'],
};

export function getBranchForApp(app: { formType?: string | null; type?: string | null }): 'C' | 'D' | 'ABE' {
  const formType = (app.formType || '').trim().toUpperCase();
  const type = (app.type || '').trim().toUpperCase();

  if (formType === 'C' || type === 'INCIDENT') {
    return 'C';
  }
  if (formType === 'D') {
    return 'D';
  }
  return 'ABE';
}

export function getAllowedTransitions(app: { formType?: string | null; type?: string | null; status: string }): string[] {
  const branch = getBranchForApp(app);
  if (branch === 'C') return TRANSITIONS_BRANCH_C[app.status] || [];
  if (branch === 'D') return TRANSITIONS_BRANCH_D[app.status] || [];
  return TRANSITIONS_BRANCH_ABE[app.status] || GLOBAL_TRANSITIONS[app.status] || [];
}

export const createApplication = async (req: Request, res: Response): Promise<void> => {
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
  } = req.body;

  // Auto-sync type if service is known
  let resolvedType = type || 'SERVICE_REQUEST';
  if (serviceCatalogId) {
    const services = localStore.getServices();
    const srv = services.find((s) => s.id === serviceCatalogId);
    if (srv?.defaultType) {
      resolvedType = srv.defaultType;
    }
  }

  const resolvedPriority = priority || computedPriority || 'MEDIUM';
  const hours = SLA_HOURS[resolvedPriority] ?? 72;
  const slaDeadline = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

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
      actorRole: (req.user as any)?.role || (req.body as any)?.actorRole || 'USER',
      changedBy: (req.user as any)?.email || (req.body as any)?.changedBy,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json(application);
  } catch {
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
      actorRole: (req.user as any)?.role || (req.body as any)?.actorRole || 'USER',
      changedBy: (req.user as any)?.email || (req.body as any)?.changedBy,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json(application);
  }
};

export const getApplications = async (_req: Request, res: Response): Promise<void> => {
  try {
    const dbApps = await db.orm.public.Application
      .orderBy((a) => a.createdAt.desc())
      .include('service')
      .all();
    const localApps = localStore.getApplications();
    const appMap = new Map<string, any>();
    for (const app of localApps || []) {
      appMap.set(app.id, app);
    }
    for (const app of dbApps || []) {
      appMap.set(app.id, app);
    }
    const combined = Array.from(appMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    res.status(200).json(combined);
  } catch {
    const applications = localStore.getApplications();
    res.status(200).json(applications);
  }
};

export const getApplicationLogs = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  try {
    const dbLogs = await db.orm.public.AuditLog
      .where({ applicationId: id })
      .orderBy((l) => l.createdAt.desc())
      .all();
    const localLogs = localStore.getAuditLogs(id);
    const logMap = new Map<string, any>();
    for (const log of localLogs || []) {
      logMap.set(log.id, log);
    }
    for (const log of dbLogs || []) {
      logMap.set(log.id, log);
    }
    const combined = Array.from(logMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    res.status(200).json(combined);
  } catch {
    const logs = localStore.getAuditLogs(id);
    res.status(200).json(logs);
  }
};

export const updateApplicationStatus = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { status, changedBy, actorRole, resolutionNote, rejectionReason } = req.body;

  let oldStatus: string | null = null;
  let didTransition = false;

  try {
    const result = await db.transaction(async (tx) => {
      const currentApp = await tx.orm.public.Application.where({ id }).first();

      if (!currentApp) {
        throw new Error('NOT_FOUND_IN_DB');
      }

      if (currentApp.status === status) {
        return currentApp;
      }

      const allowedStatuses = getAllowedTransitions(currentApp);
      if (!allowedStatuses.includes(status)) {
        throw new ValidationError(
          `Недопустимий перехід: ${currentApp.status} → ${status} (Гілка: ${getBranchForApp(currentApp)})`,
        );
      }

      if (status === 'RESOLVED' && !resolutionNote) {
        throw new ValidationError(
          'Для переведення в RESOLVED необхідно вказати опис рішення (resolutionNote)',
        );
      }

      if (status === 'REJECTED' && rejectionReason) {
        console.log(`[Status Update] Application ${id} rejected: ${rejectionReason}`);
      }

      oldStatus = currentApp.status;
      const updatedApp = await tx.orm.public.Application.where({ id }).update({ status });

      await tx.orm.public.AuditLog.create({
        applicationId: id,
        field: 'STATUS',
        oldValue: currentApp.status,
        newValue: status,
        changedBy: changedBy || actorRole || 'System',
      });

      didTransition = true;
      return updatedApp;
    });

    if (didTransition && oldStatus !== null) {
      emitStatusTransition({
        app: result,
        from: oldStatus,
        to: status,
        actorRole: (req.user as any)?.role || actorRole || 'USER',
        changedBy: (req.user as any)?.email || changedBy,
        resolutionNote,
        rejectionReason,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof ValidationError) {
      throw err;
    }

    const currentApp = localStore.getApplication(id);
    if (!currentApp) {
      throw new NotFoundError('Application not found');
    }

    if (currentApp.status === status) {
      res.status(200).json(currentApp);
      return;
    }

    const allowedStatuses = getAllowedTransitions(currentApp);
    if (!allowedStatuses.includes(status)) {
      throw new ValidationError(
        `Недопустимий перехід: ${currentApp.status} → ${status} (Гілка: ${getBranchForApp(currentApp)})`,
      );
    }

    if (status === 'RESOLVED' && !resolutionNote) {
      throw new ValidationError(
        'Для переведення в RESOLVED необхідно вказати опис рішення (resolutionNote)',
      );
    }

    const previousStatus = currentApp.status;
    const updatedApp = localStore.updateApplication(id, { status });
    localStore.createAuditLog({
      applicationId: id,
      field: 'STATUS',
      oldValue: currentApp.status,
      newValue: status,
      changedBy: changedBy || actorRole || 'System',
    });

    emitStatusTransition({
      app: updatedApp,
      from: previousStatus,
      to: status,
      actorRole: (req.user as any)?.role || actorRole || 'USER',
      changedBy: (req.user as any)?.email || changedBy,
      resolutionNote,
      rejectionReason,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json(updatedApp);
  }
};

export const linkProblemToApplication = async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
  const { problemId } = req.body;

  try {
    const updated = await db.orm.public.Application.where({ id }).update({ problemId });
    if (!updated) {
      throw new NotFoundError('Application not found');
    }
    res.status(200).json(updated);
  } catch {
    const updated = localStore.updateApplication(id, { problemId });
    if (!updated) {
      throw new NotFoundError('Application not found');
    }
    res.status(200).json(updated);
  }
};

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
