import { z } from 'zod';

const idString = z.string().min(1);

// Shared enum values (stored as strings in the Prisma schema).
const applicationType = z.enum(['SERVICE_REQUEST', 'INCIDENT']);
const priority = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const applicationStatus = z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
const changeType = z.enum(['STANDARD', 'NORMAL', 'EMERGENCY']);
const changeRisk = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const changeStatus = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'IMPLEMENTED', 'REJECTED']);
const problemStatus = z.enum(['NEW', 'RCA', 'KNOWN_ERROR', 'RESOLVED']);
const articleStatus = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const idParamSchema = z.object({ id: idString });

// Applications
export const createApplicationBody = z.object({
  applicantName: z.string().trim().min(1, 'applicantName is required'),
  type: applicationType.default('SERVICE_REQUEST'),
  priority: priority.default('LOW'),
  description: z.string().optional(),
  serviceCatalogId: z.string().nullish(),
});

export const updateApplicationStatusBody = z.object({
  status: applicationStatus,
  changedBy: z.string().optional(),
  resolutionNote: z.string().optional(),
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
