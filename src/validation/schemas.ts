/**
 * @file src/validation/schemas.ts
 * @module validation/schemas
 * @description Zod validation schemas and semantic refinement guards.
 *
 * Architectural Role:
 * Defines declarative validation rules and cross-field refinement constraints
 * for all REST API endpoints across the HAM Application Portal. Protects domain
 * entities (Applications, Changes, Problems, Knowledge Articles) against
 * invalid state representations, enforces SAFe WSJF parameters, and validates
 * specialized business rules across Forms A, B, C, D, and E.
 *
 * Inputs:
 * - Untrusted JSON payloads from request body, query strings, and path parameters.
 *
 * Outputs:
 * - Sanitized, type-safe data structures matching Prisma database models.
 * - Localized Ukrainian validation diagnostic messages on constraint failure.
 *
 * Constraints & Assumptions:
 * - Subtype «Доробка» requires a system or target URL to enable engineering triage.
 * - High Time Criticality (TC >= 4) mandates an explicit `dueDate` for SLA scheduling.
 * - Form B exports require non-empty export specifications (`exportParams`).
 * - Form D access and license requests require `role` and `license` fields respectively.
 */

import { z } from 'zod';

/** Standard positive-length identifier validator. */
const idString = z.string().min(1);

/** Shared enumeration for application ticket classifications. */
const applicationType = z.enum(['SERVICE_REQUEST', 'INCIDENT']);

/** Shared enumeration for ticket priority tiers. */
const priority = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

/**
 * 12-Status state machine enumeration governing ticket lifecycles across branches:
 * - Branch A/B/E: Dev & ТЗ refinement loop.
 * - Branch C: Incident triage & resolution fast-track.
 * - Branch D: Approval & provisioning loop.
 */
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

/** ITIL Change Request classifications. */
const changeType = z.enum(['STANDARD', 'NORMAL', 'EMERGENCY']);

/** ITIL Change Request risk tiers. */
const changeRisk = z.enum(['LOW', 'MEDIUM', 'HIGH']);

/** ITIL Change Request lifecycle statuses. */
const changeStatus = z.enum([
  'DRAFT',
  'PENDING',
  'APPROVED',
  'IMPLEMENTED',
  'REJECTED',
]);

/** ITIL Problem record lifecycle statuses. */
const problemStatus = z.enum(['NEW', 'RCA', 'KNOWN_ERROR', 'RESOLVED']);

/** ITIL Knowledge Base article publication lifecycle statuses. */
const articleStatus = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

/** Supported intake form types. */
const formTypeEnum = z.enum(['A', 'B', 'C', 'D', 'E']);

/**
 * Schema validating standard route path parameters containing an entity ID.
 */
export const idParamSchema = z.object({ id: idString });

/**
 * Schema validating intake payloads for creating new ITSM applications.
 *
 * Enforces five critical cross-field business validation constraints:
 * 1. Subtype «Доробка» requires a non-empty `payload.url`.
 * 2. Time Criticality (TC) >= 4 requires an explicit `dueDate`.
 * 3. Form B with subtype «Вивантаження» requires non-empty `exportParams`.
 * 4. Form D with subtype «Доступ» requires an explicit `role`.
 * 5. Form D with subtype «Ліцензія» requires an explicit `license` identifier.
 */
export const createApplicationBody = z
  .object({
    applicantName: z.string().trim().min(1, 'applicantName is required'),
    type: applicationType.default('SERVICE_REQUEST'),
    priority: priority.default('LOW'),
    description: z.string().optional(),
    serviceCatalogId: z.string().nullish(),

    // Extended form and requester metadata.
    formType: formTypeEnum.optional(),
    subtype: z.string().optional(),
    payload: z.any().optional(),
    requesterEmail: z.string().email('Invalid email address').optional(),

    // WSJF (Weighted Shortest Job First) prioritization metrics.
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

    // Assignment and operational tracking attributes.
    pocId: z.string().optional(),
    dueDate: z.coerce.date().optional(),
    clickupTaskId: z.string().optional(),
  })
  .superRefine((data, refinementContext) => {
    const normalizedSubtype = (data.subtype || data.payload?.subtype || '').trim();
    const normalizedFormType = (data.formType || '').trim().toUpperCase();
    const payload = data.payload || {};

    // Rule 1: A valid target system URL is mandatory when the subtype is «Доробка»
    // (modification) to ensure technical teams can locate the relevant subsystem.
    const isModificationSubtype =
      normalizedSubtype.toLowerCase() === 'доробка' ||
      normalizedSubtype.toLowerCase() === 'modification' ||
      normalizedSubtype.toLowerCase() === 'improvement';

    if (isModificationSubtype) {
      const targetUrl =
        payload.url || payload.systemUrl || payload.pageUrl || payload.targetUrl;
      if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.trim()) {
        refinementContext.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', 'url'],
          message: "URL є обов'язковим для заповнення при підтипі «Доробка»",
        });
      }
    }

    // Rule 2: When Time Criticality (TC) score is 4 or higher, an explicit due date
    // is strictly required to enable timely SLA escalation and scheduling.
    const resolvedTimeCriticality =
      typeof data.tc === 'number'
        ? data.tc
        : typeof payload.tc === 'number'
          ? payload.tc
          : null;

    if (resolvedTimeCriticality !== null && resolvedTimeCriticality >= 4) {
      const explicitDeadline = data.dueDate || payload.dueDate || payload.deadline;
      if (!explicitDeadline) {
        refinementContext.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dueDate'],
          message:
            "Кінцевий термін (dueDate) є обов'язковим при Time Criticality (TC) ≥ 4",
        });
      }
    }

    // Rule 3: Form B export requests mandate explicit parameter specifications
    // to prevent ambiguous or unconstrained data extraction jobs.
    const isExportSubtype =
      normalizedFormType === 'B' &&
      (normalizedSubtype.toLowerCase() === 'вивантаження' ||
        normalizedSubtype.toLowerCase() === 'export');

    if (isExportSubtype) {
      const exportParameters =
        payload.exportParams ||
        payload.parameters ||
        payload.exportFormat ||
        payload.filterParams ||
        payload.details;
      const isMissingParameters =
        !exportParameters ||
        (typeof exportParameters === 'string' && !exportParameters.trim()) ||
        (typeof exportParameters === 'object' &&
          Object.keys(exportParameters).length === 0);

      if (isMissingParameters) {
        refinementContext.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', 'exportParams'],
          message:
            "Параметри вивантаження є обов'язковими для форми B з підтипом «Вивантаження»",
        });
      }
    }

    // Rule 4: Form D access requests require specifying the requested user role.
    const isAccessSubtype =
      normalizedFormType === 'D' &&
      (normalizedSubtype.toLowerCase() === 'доступ' ||
        normalizedSubtype.toLowerCase() === 'access');

    if (isAccessSubtype) {
      const requestedRole =
        payload.role || payload.requestedRole || payload.accessRole;
      if (
        !requestedRole ||
        typeof requestedRole !== 'string' ||
        !requestedRole.trim()
      ) {
        refinementContext.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', 'role'],
          message:
            "Роль є обов'язковою для заповнення для форми D з підтипом «Доступ»",
        });
      }
    }

    // Rule 5: Form D software license requests require the license package name.
    const isLicenseSubtype =
      normalizedFormType === 'D' &&
      (normalizedSubtype.toLowerCase() === 'ліцензія' ||
        normalizedSubtype.toLowerCase() === 'license');

    if (isLicenseSubtype) {
      const licenseSpecification =
        payload.license || payload.licenseType || payload.licenseName;
      if (
        !licenseSpecification ||
        typeof licenseSpecification !== 'string' ||
        !licenseSpecification.trim()
      ) {
        refinementContext.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', 'license'],
          message:
            "Тип ліцензії є обов'язковим для заповнення для форми D з підтипом «Ліцензія»",
        });
      }
    }
  });

/**
 * Schema validating status transition payloads for applications.
 *
 * Captures the target status, the modifying actor, and mandatory audit rationale
 * such as `resolutionNote` when resolving or `rejectionReason` when rejecting.
 */
export const updateApplicationStatusBody = z.object({
  status: applicationStatus,
  changedBy: z.string().optional(),
  actorRole: z.enum(['USER', 'ADMIN', 'POC', 'APPROVER', 'SYSTEM']).optional(),
  resolutionNote: z.string().optional(),
  rejectionReason: z.string().optional(),
});

/**
 * Schema validating payload to link an application to an existing ITIL Problem.
 */
export const linkProblemBody = z.object({ problemId: idString });

/**
 * Schema validating creation payload for ITIL Change Requests.
 */
export const createChangeBody = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().trim().min(1, 'description is required'),
  type: changeType.default('NORMAL'),
  risk: changeRisk.default('MEDIUM'),
  scheduledAt: z.coerce.date(),
  requestedBy: z.string().optional(),
});

/**
 * Schema validating status transition payload for ITIL Change Requests.
 */
export const updateChangeStatusBody = z.object({
  status: changeStatus,
  approvedBy: z.string().optional(),
});

/**
 * Schema validating payload to link an application ticket to a Change Request.
 */
export const linkApplicationBody = z.object({ applicationId: idString });

/**
 * Schema validating creation payload for ITIL Problems.
 */
export const createProblemBody = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().trim().min(1, 'description is required'),
});

/**
 * Schema validating status transition payload for ITIL Problems.
 */
export const updateProblemStatusBody = z.object({
  status: problemStatus,
  rootCause: z.string().optional(),
  workaround: z.string().optional(),
});

/**
 * Schema validating creation payload for ITIL Knowledge Base articles.
 */
export const createArticleBody = z.object({
  title: z.string().trim().min(1, 'title is required'),
  content: z.string().trim().min(1, 'content is required'),
  category: z.string().trim().min(1, 'category is required'),
  problemId: z.string().nullish(),
});

/**
 * Schema validating update payload for existing Knowledge Base articles.
 */
export const updateArticleBody = z.object({
  title: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
});

/**
 * Schema validating status transition payload for Knowledge Base articles.
 */
export const updateArticleStatusBody = z.object({
  status: articleStatus,
});

/**
 * Schema validating query parameters for filtering knowledge articles by status.
 */
export const getArticlesQuery = z.object({
  status: articleStatus.optional(),
});

/**
 * Schema validating search query parameters for Knowledge Base full-text search.
 */
export const searchArticlesQuery = z.object({
  q: z.string().trim().min(1, 'q is required'),
});
