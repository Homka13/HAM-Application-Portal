/**
 * @file src/lib/storage.ts
 * @module lib/storage
 * @description Dual-engine storage manager supporting file persistence and test isolation.
 *
 * Architectural Role:
 * Provides robust, schema-aligned fallback persistence when running without an
 * active PostgreSQL instance (e.g. lightweight local prototyping, unit tests,
 * and integration test suites). Implements two distinct operational modes:
 * 1. Production / Dev: Synchronous direct disk persistence to `data/local-db.json`.
 * 2. Test Environment (`isTestEnv()`): In-memory caching with atomic sleep locks
 *    (`Atomics.wait`) and non-destructive disk merging to absorb multi-threaded test runner races.
 *
 * Inputs:
 * - Application data models, change requests, problem records, and audit logs.
 * - JSON disk storage file at `data/local-db.json`.
 *
 * Outputs:
 * - Typed domain entity instances with generated UUIDs and ISO-8601 timestamps.
 *
 * Constraints & Assumptions:
 * - `LocalApplication` must define `clickupTaskId` to satisfy bundle guardrail tests.
 * - Test environment isolation is strictly triggered by `NODE_ENV === 'test'` or CLI test flags.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Service catalog offering model in local storage.
 */
export interface LocalService {
  /** Unique service identifier (e.g. 'srv-1'). */
  id: string;
  /** Human-readable service title. */
  name: string;
  /** Functional service category. */
  category: string;
  /** Detailed description of the service offering. */
  description: string | null;
  /** Default application classification mapped to this service. */
  defaultType?: 'SERVICE_REQUEST' | 'INCIDENT';
}

/**
 * ITSM application entity model in local storage.
 */
export interface LocalApplication {
  /** Unique application UUID. */
  id: string;
  /** Name of the applicant requesting service. */
  applicantName: string;
  /** Ticket type classification (SERVICE_REQUEST or INCIDENT). */
  type: string;
  /** Ticket priority tier (CRITICAL, HIGH, MEDIUM, LOW). */
  priority: string;
  /** Current lifecycle status across the 12-status state machine. */
  status: string;
  /** Detailed ticket description. */
  description: string | null;
  /** Assigned engineering specialist. */
  assignee: string | null;
  /** ISO-8601 deadline timestamp calculated from SLA hours. */
  slaDeadline: string;
  /** Referenced ServiceCatalog identifier. */
  serviceCatalogId: string | null;
  /** Populated Service object joined for UI display. */
  service?: LocalService | null;
  /** Associated ITIL Problem record identifier. */
  problemId?: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last update timestamp. */
  updatedAt: string;

  // Extended form metadata and prioritization fields.
  /** Intake form classification (A, B, C, D, E). */
  formType?: string | null;
  /** Dynamic form subtype. */
  subtype?: string | null;
  /** Arbitrary subtype-specific JSON payload. */
  payload?: any;
  /** Requester contact email for notifications. */
  requesterEmail?: string | null;
  /** SAFe Business Value score (1-10). */
  bv?: number | null;
  /** SAFe Risk Reduction score (1-10). */
  r?: number | null;
  /** SAFe Time Criticality score (1-10). */
  tc?: number | null;
  /** SAFe Opportunity Enablement score (1-10). */
  aw?: number | null;
  /** SAFe Job Size / Effort score (1-10). */
  effort?: number | null;
  /** Computed Weighted Shortest Job First score. */
  wsjf?: number | null;
  /** Business impact assessment. */
  impact?: string | null;
  /** Operational urgency assessment. */
  urgency?: string | null;
  /** Severity rating. */
  severity?: string | null;
  /** Priority tier calculated from WSJF scoring. */
  computedPriority?: string | null;
  /** Point of Contact user identifier. */
  pocId?: string | null;
  /** Explicit deadline requested by user. */
  dueDate?: string | null;
  /** External ClickUp task identifier synchronized with this ticket. */
  clickupTaskId?: string | null;
}

/**
 * Historical audit trail entry tracking field mutations.
 */
export interface LocalAuditLog {
  /** Unique audit entry UUID. */
  id: string;
  /** Target application identifier. */
  applicationId: string;
  /** Mutated field name (e.g. 'STATUS', 'PRIORITY'). */
  field: string;
  /** Value prior to modification. */
  oldValue: string | null;
  /** Value resulting from modification. */
  newValue: string | null;
  /** Actor username, email, or system identifier. */
  changedBy: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * ITIL Change Request entity model in local storage.
 */
export interface LocalChangeRequest {
  /** Unique change request UUID. */
  id: string;
  /** Short summary of proposed change. */
  title: string;
  /** Comprehensive technical description. */
  description: string;
  /** Change classification (STANDARD, NORMAL, EMERGENCY). */
  type: string;
  /** Change risk rating (LOW, MEDIUM, HIGH). */
  risk: string;
  /** Lifecycle status (DRAFT, PENDING, APPROVED, IMPLEMENTED, REJECTED). */
  status: string;
  /** ISO-8601 scheduled deployment timestamp. */
  scheduledAt: string;
  /** Requesting engineer or team. */
  requestedBy: string;
  /** Authorizing manager or CAB lead. */
  approvedBy: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Linked application tickets associated with this release. */
  applications?: { id: string; applicantName: string }[];
}

/**
 * ITIL Problem record entity model in local storage.
 */
export interface LocalProblem {
  /** Unique problem investigation UUID. */
  id: string;
  /** Title summarizing the underlying defect. */
  title: string;
  /** Comprehensive incident symptoms description. */
  description: string;
  /** Investigation status (NEW, RCA, KNOWN_ERROR, RESOLVED). */
  status: string;
  /** Documented root cause analysis findings. */
  rootCause: string | null;
  /** Published interim workaround instructions. */
  workaround: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Correlated incident applications. */
  applications?: { id: string; applicantName: string }[];
}

/**
 * ITIL Knowledge Base documentation article in local storage.
 */
export interface LocalArticle {
  /** Unique knowledge article UUID. */
  id: string;
  /** Article headline or solution title. */
  title: string;
  /** Markdown or plaintext article body. */
  content: string;
  /** Organizational topic category. */
  category: string;
  /** Publication lifecycle status (DRAFT, PUBLISHED, ARCHIVED). */
  status: string;
  /** Optional linked problem investigation record ID. */
  problemId?: string | null;
  /** Associated problem summary. */
  problem?: { id: string; title: string; status: string } | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last update timestamp. */
  updatedAt: string;
}

/**
 * Complete document schema for the local JSON persistence file.
 */
interface LocalDatabase {
  services: LocalService[];
  applications: LocalApplication[];
  auditLogs: LocalAuditLog[];
  changes: LocalChangeRequest[];
  problems: LocalProblem[];
  articles: LocalArticle[];
}

/** Seed service offerings loaded upon initial database creation. */
const DEFAULT_SERVICES: LocalService[] = [
  {
    id: 'srv-1',
    name: 'Створення звіт павер бі',
    category: 'Power BI',
    description: 'Створення або доопрацювання аналітичного звіту в Power BI',
    defaultType: 'SERVICE_REQUEST',
  },
  {
    id: 'srv-2',
    name: 'Отримання доступу до павер бі',
    category: 'Power BI',
    description: 'Надання доступу до звітів або робочої області Power BI',
    defaultType: 'SERVICE_REQUEST',
  },
  {
    id: 'srv-3',
    name: 'Створення заявки на номенклатуру',
    category: 'ERP / Номенклатура',
    description: 'Заведення нової товарної номенклатури або довідника в ERP',
    defaultType: 'SERVICE_REQUEST',
  },
  {
    id: 'srv-4',
    name: 'Зупинка виробництва',
    category: 'Виробництво / Інциденти',
    description: 'Аварійна зупинка виробничого процесу / технологічної лінії',
    defaultType: 'INCIDENT',
  },
];

/** Seed knowledge articles providing operational guidance out of the box. */
const DEFAULT_ARTICLES: LocalArticle[] = [
  {
    id: 'art-1',
    title: 'Інструкція з роботи з Power BI',
    content:
      '1. Перейдіть на app.powerbi.com.\n2. Увійдіть через корпоративний логін.\n3. Оберіть робочу область вашого підрозділу.',
    category: 'Power BI',
    status: 'PUBLISHED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'art-2',
    title: 'Регламент дій при зупинці виробництва',
    content:
      '1. Негайно зафіксуйте час зупинки та повідомте чергового диспетчера.\n2. Створіть інцидент у HAM Portal із пріоритетом Критичний.',
    category: 'Інциденти',
    status: 'PUBLISHED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/** Persistent JSON file path on local filesystem. */
const DB_FILE = path.join(process.cwd(), 'data', 'local-db.json');

/**
 * Determines whether the current process is executing under the automated test runner.
 *
 * Checks NODE_ENV flag as well as CLI argument paths.
 *
 * @returns True if test runner execution is detected.
 */
function isTestEnv(): boolean {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'development'
  ) {
    return false;
  }
  return (
    process.env.NODE_ENV === 'test' ||
    process.argv.some(
      (argument) => typeof argument === 'string' && argument.includes('test'),
    )
  );
}

/**
 * Loads database state in production or development mode.
 * Reads directly from disk synchronously without in-memory mutation.
 */
function loadDbProd(): LocalDatabase {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsedData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      return {
        services: DEFAULT_SERVICES,
        applications: parsedData.applications || [],
        auditLogs: parsedData.auditLogs || [],
        changes: parsedData.changes || [],
        problems: parsedData.problems || [],
        articles: parsedData.articles?.length
          ? parsedData.articles
          : DEFAULT_ARTICLES,
      };
    }
  } catch {
    // If reading or parsing fails, initialize clean state.
  }

  const initialDatabase: LocalDatabase = {
    services: DEFAULT_SERVICES,
    applications: [],
    auditLogs: [],
    changes: [],
    problems: [],
    articles: DEFAULT_ARTICLES,
  };
  saveDbProd(initialDatabase);
  return initialDatabase;
}

/**
 * Persists database state synchronously to disk in production or development mode.
 */
function saveDbProd(database: LocalDatabase): void {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to persist local DB:', error);
  }
}

/** In-memory cache holding database state across concurrent test invocations. */
let memoryDb: LocalDatabase | null = null;

/**
 * Merges in-memory database state with disk state to prevent test workers
 * from overwriting each other's updates during parallel test runs.
 */
function mergeDb(
  currentMemoryState: LocalDatabase | null,
  diskState: LocalDatabase,
): LocalDatabase {
  if (!currentMemoryState) {
    return diskState;
  }

  const applicationMap = new Map<string, LocalApplication>();
  for (const app of diskState.applications || []) {
    applicationMap.set(app.id, app);
  }
  for (const app of currentMemoryState.applications || []) {
    if (!applicationMap.has(app.id)) {
      applicationMap.set(app.id, app);
    }
  }

  const auditLogMap = new Map<string, LocalAuditLog>();
  for (const log of diskState.auditLogs || []) {
    auditLogMap.set(log.id, log);
  }
  for (const log of currentMemoryState.auditLogs || []) {
    if (!auditLogMap.has(log.id)) {
      auditLogMap.set(log.id, log);
    }
  }

  return {
    services: DEFAULT_SERVICES,
    applications: Array.from(applicationMap.values()),
    auditLogs: Array.from(auditLogMap.values()),
    changes: diskState.changes?.length
      ? diskState.changes
      : currentMemoryState.changes,
    problems: diskState.problems?.length
      ? diskState.problems
      : currentMemoryState.problems,
    articles: diskState.articles?.length
      ? diskState.articles
      : currentMemoryState.articles,
  };
}

/**
 * Loads database state in test mode with retry spinlocks.
 */
function loadDbTest(): LocalDatabase {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (fs.existsSync(DB_FILE)) {
        const rawContent = fs.readFileSync(DB_FILE, 'utf-8');
        if (rawContent.trim()) {
          const parsedData = JSON.parse(rawContent);
          const diskDb: LocalDatabase = {
            services: DEFAULT_SERVICES,
            applications: parsedData.applications || [],
            auditLogs: parsedData.auditLogs || [],
            changes: parsedData.changes || [],
            problems: parsedData.problems || [],
            articles: parsedData.articles?.length
              ? parsedData.articles
              : DEFAULT_ARTICLES,
          };
          memoryDb = mergeDb(memoryDb, diskDb);
          return memoryDb;
        }
      }
    } catch {
      // Sleep for 10ms using Atomics.wait on SharedArrayBuffer to yield thread.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }

  if (memoryDb) {
    return memoryDb;
  }

  const initialDatabase: LocalDatabase = {
    services: DEFAULT_SERVICES,
    applications: [],
    auditLogs: [],
    changes: [],
    problems: [],
    articles: DEFAULT_ARTICLES,
  };
  memoryDb = initialDatabase;
  saveDbTest(initialDatabase);
  return initialDatabase;
}

/**
 * Persists database state in test mode with retry spinlocks.
 */
function saveDbTest(database: LocalDatabase): void {
  memoryDb = database;
  const parentDirectory = path.dirname(DB_FILE);
  fs.mkdirSync(parentDirectory, { recursive: true });

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2), 'utf-8');
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

/**
 * Internal dispatcher delegating read operations based on active environment.
 */
function loadDb(): LocalDatabase {
  if (isTestEnv()) {
    return loadDbTest();
  }
  return loadDbProd();
}

/**
 * Internal dispatcher delegating write operations based on active environment.
 */
function saveDb(database: LocalDatabase): void {
  if (isTestEnv()) {
    saveDbTest(database);
    return;
  }
  saveDbProd(database);
}

/**
 * Local storage engine providing synchronous CRUD operations across domain entities.
 */
export const localStore = {
  /**
   * Retrieves the catalog of active IT service offerings.
   *
   * @returns Array of LocalService items.
   */
  getServices(): LocalService[] {
    const database = loadDb();
    return database.services;
  },

  /**
   * Retrieves all applications, joining associated service records.
   *
   * Ordered chronologically descending by creation timestamp.
   *
   * @returns Array of LocalApplication items.
   */
  getApplications(): LocalApplication[] {
    const database = loadDb();
    const serviceLookup = new Map(
      database.services.map((service) => [service.id, service]),
    );

    return database.applications
      .map((application) => ({
        ...application,
        service: application.serviceCatalogId
          ? serviceLookup.get(application.serviceCatalogId) || null
          : null,
      }))
      .sort(
        (firstApp, secondApp) =>
          new Date(secondApp.createdAt).getTime() -
          new Date(firstApp.createdAt).getTime(),
      );
  },

  /**
   * Creates a new application record in local storage.
   *
   * @param data - Application intake attributes.
   * @returns Newly created LocalApplication record.
   */
  createApplication(data: {
    applicantName: string;
    type: string;
    priority: string;
    description?: string | null;
    slaDeadline: string;
    serviceCatalogId?: string | null;
    formType?: string | null;
    subtype?: string | null;
    payload?: any;
    requesterEmail?: string | null;
    bv?: number | null;
    r?: number | null;
    tc?: number | null;
    aw?: number | null;
    effort?: number | null;
    wsjf?: number | null;
    impact?: string | null;
    urgency?: string | null;
    severity?: string | null;
    computedPriority?: string | null;
    pocId?: string | null;
    dueDate?: string | null;
    clickupTaskId?: string | null;
  }): LocalApplication {
    const database = loadDb();
    const newApplication: LocalApplication = {
      id: crypto.randomUUID(),
      applicantName: data.applicantName,
      type: data.type,
      priority: data.priority,
      status: 'NEW',
      description: data.description || null,
      assignee: null,
      slaDeadline: data.slaDeadline,
      serviceCatalogId: data.serviceCatalogId || null,
      problemId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      formType: data.formType || null,
      subtype: data.subtype || null,
      payload: data.payload || null,
      requesterEmail: data.requesterEmail || null,
      bv: data.bv ?? null,
      r: data.r ?? null,
      tc: data.tc ?? null,
      aw: data.aw ?? null,
      effort: data.effort ?? null,
      wsjf: data.wsjf ?? null,
      impact: data.impact || null,
      urgency: data.urgency || null,
      severity: data.severity || null,
      computedPriority: data.computedPriority || null,
      pocId: data.pocId || null,
      dueDate: data.dueDate || null,
      clickupTaskId: data.clickupTaskId || null,
    };

    database.applications.push(newApplication);
    saveDb(database);
    return newApplication;
  },

  /**
   * Applies partial updates to an existing application record.
   *
   * @param id - Application UUID.
   * @param updates - Partial object containing mutated properties.
   * @returns Updated LocalApplication record, or null if not found.
   */
  updateApplication(
    id: string,
    updates: Partial<LocalApplication>,
  ): LocalApplication | null {
    const database = loadDb();
    const targetIndex = database.applications.findIndex(
      (application) => application.id === id,
    );
    if (targetIndex === -1) {
      return null;
    }

    database.applications[targetIndex] = {
      ...database.applications[targetIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveDb(database);
    return database.applications[targetIndex];
  },

  /**
   * Retrieves a single application record by its identifier.
   *
   * @param id - Application UUID.
   * @returns LocalApplication record or null.
   */
  getApplication(id: string): LocalApplication | null {
    const database = loadDb();
    return (
      database.applications.find((application) => application.id === id) || null
    );
  },

  /**
   * Retrieves audit log entries associated with a specific application ticket.
   *
   * @param applicationId - Application UUID.
   * @returns Array of LocalAuditLog records ordered by creation date descending.
   */
  getAuditLogs(applicationId: string): LocalAuditLog[] {
    const database = loadDb();
    return database.auditLogs
      .filter((log) => log.applicationId === applicationId)
      .sort(
        (firstLog, secondLog) =>
          new Date(secondLog.createdAt).getTime() -
          new Date(firstLog.createdAt).getTime(),
      );
  },

  /**
   * Records a new audit trail log entry.
   *
   * @param log - Log attributes excluding `id` and `createdAt`.
   * @returns Newly created LocalAuditLog record.
   */
  createAuditLog(
    log: Omit<LocalAuditLog, 'id' | 'createdAt'>,
  ): LocalAuditLog {
    const database = loadDb();
    const newAuditLog: LocalAuditLog = {
      id: crypto.randomUUID(),
      ...log,
      createdAt: new Date().toISOString(),
    };
    database.auditLogs.push(newAuditLog);
    saveDb(database);
    return newAuditLog;
  },

  /**
   * Retrieves all Change Requests ordered by creation timestamp descending.
   *
   * @returns Array of LocalChangeRequest records.
   */
  getChanges(): LocalChangeRequest[] {
    const database = loadDb();
    return database.changes.sort(
      (firstChange, secondChange) =>
        new Date(secondChange.createdAt).getTime() -
        new Date(firstChange.createdAt).getTime(),
    );
  },

  /**
   * Creates a new Change Request in DRAFT status.
   *
   * @param data - Change request parameters.
   * @returns Newly created LocalChangeRequest record.
   */
  createChange(
    data: Omit<
      LocalChangeRequest,
      'id' | 'createdAt' | 'status' | 'approvedBy'
    >,
  ): LocalChangeRequest {
    const database = loadDb();
    const newChangeRequest: LocalChangeRequest = {
      id: crypto.randomUUID(),
      ...data,
      status: 'DRAFT',
      approvedBy: null,
      createdAt: new Date().toISOString(),
    };
    database.changes.push(newChangeRequest);
    saveDb(database);
    return newChangeRequest;
  },

  /**
   * Applies partial updates to an existing Change Request.
   *
   * @param id - Change Request UUID.
   * @param updates - Partial object containing mutated properties.
   * @returns Updated LocalChangeRequest record, or null if not found.
   */
  updateChange(
    id: string,
    updates: Partial<LocalChangeRequest>,
  ): LocalChangeRequest | null {
    const database = loadDb();
    const targetIndex = database.changes.findIndex(
      (change) => change.id === id,
    );
    if (targetIndex === -1) {
      return null;
    }

    database.changes[targetIndex] = {
      ...database.changes[targetIndex],
      ...updates,
    };
    saveDb(database);
    return database.changes[targetIndex];
  },

  /**
   * Retrieves all Problem records ordered by creation timestamp descending.
   *
   * @returns Array of LocalProblem records.
   */
  getProblems(): LocalProblem[] {
    const database = loadDb();
    return database.problems.sort(
      (firstProblem, secondProblem) =>
        new Date(secondProblem.createdAt).getTime() -
        new Date(firstProblem.createdAt).getTime(),
    );
  },

  /**
   * Creates a new Problem investigation ticket in NEW status.
   *
   * @param data - Problem parameters.
   * @returns Newly created LocalProblem record.
   */
  createProblem(
    data: Omit<
      LocalProblem,
      'id' | 'createdAt' | 'status' | 'rootCause' | 'workaround'
    >,
  ): LocalProblem {
    const database = loadDb();
    const newProblem: LocalProblem = {
      id: crypto.randomUUID(),
      ...data,
      status: 'NEW',
      rootCause: null,
      workaround: null,
      createdAt: new Date().toISOString(),
    };
    database.problems.push(newProblem);
    saveDb(database);
    return newProblem;
  },

  /**
   * Applies partial updates to an existing Problem record.
   *
   * @param id - Problem UUID.
   * @param updates - Partial object containing mutated properties.
   * @returns Updated LocalProblem record, or null if not found.
   */
  updateProblem(
    id: string,
    updates: Partial<LocalProblem>,
  ): LocalProblem | null {
    const database = loadDb();
    const targetIndex = database.problems.findIndex(
      (problem) => problem.id === id,
    );
    if (targetIndex === -1) {
      return null;
    }

    database.problems[targetIndex] = {
      ...database.problems[targetIndex],
      ...updates,
    };
    saveDb(database);
    return database.problems[targetIndex];
  },

  /**
   * Retrieves Knowledge Base articles, optionally filtered by status.
   *
   * @param statusFilter - Optional publication status filter.
   * @returns Array of LocalArticle records.
   */
  getArticles(statusFilter?: string): LocalArticle[] {
    const database = loadDb();
    let articles = database.articles;
    if (statusFilter) {
      articles = articles.filter((article) => article.status === statusFilter);
    }
    return articles.sort(
      (firstArticle, secondArticle) =>
        new Date(secondArticle.createdAt).getTime() -
        new Date(firstArticle.createdAt).getTime(),
    );
  },

  /**
   * Creates a new Knowledge Base article in DRAFT status.
   *
   * @param data - Article parameters.
   * @returns Newly created LocalArticle record.
   */
  createArticle(
    data: Omit<LocalArticle, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
      status?: string;
    },
  ): LocalArticle {
    const database = loadDb();
    const newArticle: LocalArticle = {
      id: crypto.randomUUID(),
      ...data,
      status: data.status || 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    database.articles.push(newArticle);
    saveDb(database);
    return newArticle;
  },

  /**
   * Applies partial updates to an existing Knowledge Base article.
   *
   * @param id - Article UUID.
   * @param updates - Partial object containing mutated properties.
   * @returns Updated LocalArticle record, or null if not found.
   */
  updateArticle(
    id: string,
    updates: Partial<LocalArticle>,
  ): LocalArticle | null {
    const database = loadDb();
    const targetIndex = database.articles.findIndex(
      (article) => article.id === id,
    );
    if (targetIndex === -1) {
      return null;
    }

    database.articles[targetIndex] = {
      ...database.articles[targetIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveDb(database);
    return database.articles[targetIndex];
  },

  /**
   * Searches published articles by matching query keywords against title and content.
   *
   * @param query - Search keyword string.
   * @returns Array of matching article summaries.
   */
  searchArticles(
    query: string,
  ): { id: string; title: string; category: string }[] {
    const database = loadDb();
    const normalizedQuery = query.toLowerCase();
    return database.articles
      .filter(
        (article) =>
          article.status === 'PUBLISHED' &&
          (article.title.toLowerCase().includes(normalizedQuery) ||
            article.content.toLowerCase().includes(normalizedQuery)),
      )
      .map((article) => ({
        id: article.id,
        title: article.title,
        category: article.category,
      }));
  },
};
