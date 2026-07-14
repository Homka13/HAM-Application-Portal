import cron from 'node-cron';
import prisma from './config/db';

export const initSlaEscalation = () => {
  cron.schedule('*/15 * * * *', async () => {
    console.log('[SLA] Running escalation check...');

    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60000);

    const overdue = await prisma.application.findMany({
      where: {
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        slaDeadline: { lte: thirtyMinutesFromNow },
        priority: { not: 'CRITICAL' },
      },
    });

    for (const app of overdue) {
      await prisma.$transaction([
        prisma.application.update({
          where: { id: app.id },
          data: { priority: 'CRITICAL' },
        }),
        prisma.auditLog.create({
          data: {
            applicationId: app.id,
            field: 'PRIORITY',
            oldValue: app.priority,
            newValue: 'CRITICAL',
            changedBy: 'System (Auto-Escalation)',
          },
        }),
      ]);
      console.log(`[SLA] Escalated ${app.id} to CRITICAL`);
    }

    if (overdue.length === 0) {
      console.log('[SLA] No tickets to escalate');
    }
  });
};
