/**
 * @file src/cronJobs.ts
 * @module cronJobs
 * @description Scheduled background tasks and proactive SLA auto-escalation engine.
 *
 * Architectural Role:
 * Runs scheduled periodic background jobs across the application lifecycle.
 * Specifically manages the SLA auto-escalation cron service, which proactively
 * scans active ITSM tickets every 15 minutes. Tickets that are within 30 minutes
 * of breaching their contractual SLA deadline and not yet resolved or closed are
 * elevated to CRITICAL priority to signal urgent remediation.
 *
 * Inputs:
 * - Current wall-clock time (`Date.now()`).
 * - Application records from PostgreSQL via Prisma ORM or in-memory `localStore`.
 *
 * Outputs:
 * - Priority updates (`priority = 'CRITICAL'`) applied to overdue applications.
 * - Structured audit trail entries (`AuditLog`) attributed to 'System (Auto-Escalation)'.
 *
 * Constraints & Assumptions:
 * - Escalation only applies to tickets in non-terminal statuses (excluding RESOLVED and CLOSED).
 * - Tickets already marked CRITICAL are skipped to prevent redundant database writes.
 * - Operates transparently against either PostgreSQL or `localStore` fallback.
 */

import cron from 'node-cron';
import { and } from '@prisma/orm-postgres/orm-client';
import { db } from './config/db';
import { localStore } from './lib/storage';

/**
 * Initializes and registers the scheduled SLA auto-escalation background worker.
 *
 * The worker executes every 15 minutes (`*\/15 * * * *`). For each active ticket
 * whose SLA deadline is within 30 minutes of expiration and whose priority is not
 * yet CRITICAL, the job elevates the ticket's priority to CRITICAL and creates an
 * audit log record to preserve compliance traceability.
 */
export const initSlaEscalation = (): void => {
  // Schedule cron to run every 15 minutes.
  cron.schedule('*/15 * * * *', async () => {
    console.log('[SLA] Running escalation check...');

    const currentTime = new Date();
    // Calculate the 30-minute lookahead threshold for impending SLA breaches.
    const thirtyMinutesFromNow = new Date(currentTime.getTime() + 30 * 60 * 1000);

    try {
      // Query database for non-terminal applications nearing their SLA deadline.
      const overdueApplications = await db.orm.public.Application
        .where((application) =>
          and(
            application.status.notIn(['RESOLVED', 'CLOSED']),
            application.slaDeadline.lte(thirtyMinutesFromNow.toISOString()),
            application.priority.neq('CRITICAL'),
          ),
        )
        .all();

      for (const application of overdueApplications) {
        // Wrap priority update and audit trail entry in an atomic transaction.
        await db.transaction(async (transaction) => {
          await transaction.orm.public.Application
            .where({ id: application.id })
            .update({
              priority: 'CRITICAL',
            });

          await transaction.orm.public.AuditLog.create({
            applicationId: application.id,
            field: 'PRIORITY',
            oldValue: application.priority,
            newValue: 'CRITICAL',
            changedBy: 'System (Auto-Escalation)',
          });
        });

        console.log(`[SLA] Escalated ${application.id} to CRITICAL`);
      }

      if (overdueApplications.length === 0) {
        console.log('[SLA] No tickets to escalate');
      }
    } catch {
      // Fallback path for test isolation or environments where PostgreSQL is offline.
      const allApplications = localStore.getApplications();
      const overdueApplications = allApplications.filter(
        (application) =>
          application.status !== 'RESOLVED' &&
          application.status !== 'CLOSED' &&
          new Date(application.slaDeadline).getTime() <= thirtyMinutesFromNow.getTime() &&
          application.priority !== 'CRITICAL',
      );

      for (const application of overdueApplications) {
        localStore.updateApplication(application.id, { priority: 'CRITICAL' });
        localStore.createAuditLog({
          applicationId: application.id,
          field: 'PRIORITY',
          oldValue: application.priority,
          newValue: 'CRITICAL',
          changedBy: 'System (Auto-Escalation)',
        });
        console.log(`[SLA] Escalated ${application.id} to CRITICAL (localStore)`);
      }
    }
  });
};
