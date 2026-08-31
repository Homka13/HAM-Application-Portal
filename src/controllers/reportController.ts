import { Request, Response } from 'express';
import prisma from '../config/db';

export const getStats = async (_req: Request, res: Response): Promise<void> => {
  const resolved = await prisma.application.findMany({
    where: { status: 'RESOLVED' },
    include: {
      auditLogs: {
        where: { field: 'STATUS' },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  let totalMttr = 0;
  let mttrCount = 0;
  let slaMet = 0;
  let slaTotal = 0;

  resolved.forEach((app) => {
    const startLog = app.auditLogs.find((l) => l.newValue === 'IN_PROGRESS');
    const endLog = app.auditLogs.find((l) => l.newValue === 'RESOLVED');
    if (startLog && endLog) {
      const duration = endLog.createdAt.getTime() - startLog.createdAt.getTime();
      totalMttr += duration;
      mttrCount++;
    }
    if (app.slaDeadline) {
      slaTotal++;
      const resolvedAt = endLog?.createdAt || app.createdAt;
      if (resolvedAt <= app.slaDeadline) slaMet++;
    }
  });

  const mttrMinutes = mttrCount > 0 ? Math.round(totalMttr / mttrCount / 60000) : 0;
  const slaRate = slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) : 100;

  const byService = await prisma.application.groupBy({
    by: ['serviceCatalogId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  const serviceIds = byService.map((s) => s.serviceCatalogId).filter(Boolean) as string[];
  const services = serviceIds.length
    ? await prisma.serviceCatalog.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true },
      })
    : [];

  const serviceMap = new Map(services.map((s) => [s.id, s.name]));
  const incidentVolume = byService.map((s) => ({
    name: serviceMap.get(s.serviceCatalogId || '') || 'Без сервісу',
    count: s._count.id,
  }));

  const totalIncidents = await prisma.application.count();
  const totalProblems = await prisma.problem.count();
  const problemRatio = totalIncidents > 0 ? ((totalProblems / totalIncidents) * 100).toFixed(1) : '0.0';

  const statusCounts = await prisma.application.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  const byStatus: Record<string, number> = {};
  statusCounts.forEach((s) => (byStatus[s.status] = s._count.id));

  res.status(200).json({
    mttrMinutes,
    slaRate,
    incidentVolume,
    problemRatio: Number(problemRatio),
    totalIncidents,
    totalProblems,
    byStatus,
  });
};
