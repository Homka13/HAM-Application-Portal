import cron from 'node-cron';
import { and } from '@prisma/orm-postgres/orm-client';
import { db } from './config/db';

export const initSlaEscalation = () => {
  cron.schedule('*/15 * * * *', async () => {
    console.log('[SLA] Running escalation check...');

    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60000);

    const overdue = await db.orm.public.Application
      .where((a) =>
        and(
          a.status.notIn(['RESOLVED', 'CLOSED']),
          a.slaDeadline.lte(thirtyMinutesFromNow.toISOString()),
          a.priority.neq('CRITICAL'),
        ),
      )
      .all();

    for (const app of overdue) {
      await db.transaction(async (tx) => {
        await tx.orm.public.Application.where({ id: app.id }).update({
          priority: 'CRITICAL',
        });
        await tx.orm.public.AuditLog.create({
          applicationId: app.id,
          field: 'PRIORITY',
          oldValue: app.priority,
          newValue: 'CRITICAL',
          changedBy: 'System (Auto-Escalation)',
        });
      });
      console.log(`[SLA] Escalated ${app.id} to CRITICAL`);
    }

    if (overdue.length === 0) {
      console.log('[SLA] No tickets to escalate');
    }
  });
};
