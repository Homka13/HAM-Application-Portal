import { z } from 'zod';

const idString = z.string().min(1);

// Shared enum values (stored as strings in the Prisma schema).
const applicationType = z.enum(['SERVICE_REQUEST', 'INCIDENT']);
const priority = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const applicationStatus = z.enum([
  'NEW',
  'TZ_PREPARATION',
  'PENDING_APPROVAL',
  'APPROVED',
  'TRIAGE',
  'ESTIMATION',
  'IN_PROGRESS',
  'TESTING',
  'UAT',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
]);
const changeType = z.enum(['STANDARD', 'NORMAL', 'EMERGENCY']);
const changeRisk = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const changeStatus = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'IMPLEMENTED', 'REJECTED']);
const problemStatus = z.enum(['NEW', 'RCA', 'KNOWN_ERROR', 'RESOLVED']);
const articleStatus = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const idParamSchema = z.object({ id: idString });

const formTypeEnum = z.enum(['A', 'B', 'C', 'D', 'E']);

// Applications
export const createApplicationBody = z.object({
  applicantName: z.string().trim().min(1, 'applicantName is required'),
  type: applicationType.default('SERVICE_REQUEST'),
  priority: priority.default('LOW'),
  description: z.string().optional(),
  serviceCatalogId: z.string().nullish(),

  // Extended form & requester metadata
  formType: formTypeEnum.optional(),
  subtype: z.string().optional(),
  payload: z.any().optional(),
  requesterEmail: z.string().email('Invalid email address').optional(),

  // Prioritization and WSJF scoring
  bv: z.number().optional(),
  r: z.number().optional(),
  tc: z.number().optional(),
  aw: z.number().optional(),
  effort: z.number().optional(),
  wsjf: z.number().optional(),
  impact: z.string().optional(),
  urgency: z.string().optional(),
  severity: z.string().optional(),
  computedPriority: z.string().optional(),

  // Assignment and tracking
  pocId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  clickupTaskId: z.string().optional(),
}).superRefine((data, ctx) => {
  const subtypeNormalized = (data.subtype || data.payload?.subtype || '').trim();
  const formTypeNormalized = (data.formType || '').trim().toUpperCase();
  const payload = data.payload || {};

  // 1. URL обов'язковий при підтипі «Доробка»
  if (
    subtypeNormalized.toLowerCase() === 'доробка' ||
    subtypeNormalized.toLowerCase() === 'modification' ||
    subtypeNormalized.toLowerCase() === 'improvement'
  ) {
    const url = payload.url || payload.systemUrl || payload.pageUrl || payload.targetUrl;
    if (!url || typeof url !== 'string' || !url.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'url'],
        message: "URL є обов'язковим для заповнення при підтипі «Доробка»",
      });
    }
  }

  // 2. Дедлайн (dueDate) обов'язковий при TC ≥ 4
  const tcScore = typeof data.tc === 'number' ? data.tc : (typeof payload.tc === 'number' ? payload.tc : null);
  if (tcScore !== null && tcScore >= 4) {
    const deadline = data.dueDate || payload.dueDate || payload.deadline;
    if (!deadline) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: "Кінцевий термін (dueDate) є обов'язковим при Time Criticality (TC) ≥ 4",
      });
    }
  }

  // 3. Параметри вивантаження при B = «Вивантаження»
  if (
    formTypeNormalized === 'B' &&
    (subtypeNormalized.toLowerCase() === 'вивантаження' || subtypeNormalized.toLowerCase() === 'export')
  ) {
    const exportParams =
      payload.exportParams ||
      payload.parameters ||
      payload.exportFormat ||
      payload.filterParams ||
      payload.details;
    if (
      !exportParams ||
      (typeof exportParams === 'string' && !exportParams.trim()) ||
      (typeof exportParams === 'object' && Object.keys(exportParams).length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'exportParams'],
        message: "Параметри вивантаження є обов'язковими для форми B з підтипом «Вивантаження»",
      });
    }
  }

  // 4. Роль обов'язкова при D = «Доступ»
  if (
    formTypeNormalized === 'D' &&
    (subtypeNormalized.toLowerCase() === 'доступ' || subtypeNormalized.toLowerCase() === 'access')
  ) {
    const role = payload.role || payload.requestedRole || payload.accessRole;
    if (!role || typeof role !== 'string' || !role.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'role'],
        message: "Роль є обов'язковою для заповнення для форми D з підтипом «Доступ»",
      });
    }
  }

  // 5. Ліцензія обов'язкова при D = «Ліцензія»
  if (
    formTypeNormalized === 'D' &&
    (subtypeNormalized.toLowerCase() === 'ліцензія' || subtypeNormalized.toLowerCase() === 'license')
  ) {
    const license = payload.license || payload.licenseType || payload.licenseName;
    if (!license || typeof license !== 'string' || !license.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'license'],
        message: "Тип ліцензії є обов'язковим для заповнення для форми D з підтипом «Ліцензія»",
      });
    }
  }
});

export const updateApplicationStatusBody = z.object({
  status: applicationStatus,
  changedBy: z.string().optional(),
  actorRole: z.enum(['USER', 'ADMIN', 'POC', 'APPROVER', 'SYSTEM']).optional(),
  resolutionNote: z.string().optional(),
  rejectionReason: z.string().optional(),
});

export const linkProblemBody = z.object({ problemId: idString });

// Changes
export const createChangeBody = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().trim().min(1, 'description is required'),
  type: changeType.default('NORMAL'),
  risk: changeRisk.default('MEDIUM'),
  scheduledAt: z.coerce.date(),
  requestedBy: z.string().optional(),
});

export const updateChangeStatusBody = z.object({
  status: changeStatus,
  approvedBy: z.string().optional(),
});

export const linkApplicationBody = z.object({ applicationId: idString });

// Problems
export const createProblemBody = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().trim().min(1, 'description is required'),
});

export const updateProblemStatusBody = z.object({
  status: problemStatus,
  rootCause: z.string().optional(),
  workaround: z.string().optional(),
});

// Knowledge Base
export const createArticleBody = z.object({
  title: z.string().trim().min(1, 'title is required'),
  content: z.string().trim().min(1, 'content is required'),
  category: z.string().trim().min(1, 'category is required'),
  problemId: z.string().nullish(),
});

export const updateArticleBody = z.object({
  title: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
});

export const updateArticleStatusBody = z.object({
  status: articleStatus,
});

export const getArticlesQuery = z.object({
  status: articleStatus.optional(),
});

export const searchArticlesQuery = z.object({
  q: z.string().trim().min(1, 'q is required'),
});
