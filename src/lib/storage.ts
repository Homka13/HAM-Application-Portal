import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface LocalService {
  id: string;
  name: string;
  category: string;
  description: string | null;
  defaultType?: 'SERVICE_REQUEST' | 'INCIDENT';
}

export interface LocalApplication {
  id: string;
  applicantName: string;
  type: string;
  priority: string;
  status: string;
  description: string | null;
  assignee: string | null;
  slaDeadline: string;
  serviceCatalogId: string | null;
  service?: LocalService | null;
  problemId?: string | null;
  createdAt: string;
  updatedAt: string;

  // Extended form and prioritization fields
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
}

export interface LocalAuditLog {
  id: string;
  applicationId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

export interface LocalChangeRequest {
  id: string;
  title: string;
  description: string;
  type: string;
  risk: string;
  status: string;
  scheduledAt: string;
  requestedBy: string;
  approvedBy: string | null;
  createdAt: string;
  applications?: { id: string; applicantName: string }[];
}

export interface LocalProblem {
  id: string;
  title: string;
  description: string;
  status: string;
  rootCause: string | null;
  workaround: string | null;
  createdAt: string;
  applications?: { id: string; applicantName: string }[];
}

export interface LocalArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  problemId?: string | null;
  problem?: { id: string; title: string; status: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface LocalDatabase {
  services: LocalService[];
  applications: LocalApplication[];
  auditLogs: LocalAuditLog[];
  changes: LocalChangeRequest[];
  problems: LocalProblem[];
  articles: LocalArticle[];
}

const DEFAULT_SERVICES: LocalService[] = [
  { id: 'srv-1', name: 'Створення звіт павер бі', category: 'Power BI', description: 'Створення або доопрацювання аналітичного звіту в Power BI', defaultType: 'SERVICE_REQUEST' },
  { id: 'srv-2', name: 'Отримання доступу до павер бі', category: 'Power BI', description: 'Надання доступу до звітів або робочої області Power BI', defaultType: 'SERVICE_REQUEST' },
  { id: 'srv-3', name: 'Створення заявки на номенклатуру', category: 'ERP / Номенклатура', description: 'Заведення нової товарної номенклатури або довідника в ERP', defaultType: 'SERVICE_REQUEST' },
  { id: 'srv-4', name: 'Зупинка виробництва', category: 'Виробництво / Інциденти', description: 'Аварійна зупинка виробничого процесу / технологічної лінії', defaultType: 'INCIDENT' },
];

const DEFAULT_ARTICLES: LocalArticle[] = [
  {
    id: 'art-1',
    title: 'Інструкція з роботи з Power BI',
    content: '1. Перейдіть на app.powerbi.com.\n2. Увійдіть через корпоративний логін.\n3. Оберіть робочу область вашого підрозділу.',
    category: 'Power BI',
    status: 'PUBLISHED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'art-2',
    title: 'Регламент дій при зупинці виробництва',
    content: '1. Негайно зафіксуйте час зупинки та повідомте чергового диспетчера.\n2. Створіть інцидент у HAM Portal із пріоритетом Критичний.',
    category: 'Інциденти',
    status: 'PUBLISHED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DB_FILE = path.join(process.cwd(), 'data', 'local-db.json');

function loadDb(): LocalDatabase {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      return {
        services: DEFAULT_SERVICES,
        applications: data.applications || [],
        auditLogs: data.auditLogs || [],
        changes: data.changes || [],
        problems: data.problems || [],
        articles: data.articles?.length ? data.articles : DEFAULT_ARTICLES,
      };
    }
  } catch {}

  const initial: LocalDatabase = {
    services: DEFAULT_SERVICES,
    applications: [],
    auditLogs: [],
    changes: [],
    problems: [],
    articles: DEFAULT_ARTICLES,
  };
  saveDb(initial);
  return initial;
}

function saveDb(data: LocalDatabase): void {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist local DB:', err);
  }
}

export const localStore = {
  getServices(): LocalService[] {
    const db = loadDb();
    return db.services;
  },

  getApplications(): LocalApplication[] {
    const db = loadDb();
    const servicesMap = new Map(db.services.map((s) => [s.id, s]));
    return db.applications
      .map((app) => ({
        ...app,
        service: app.serviceCatalogId ? servicesMap.get(app.serviceCatalogId) || null : null,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

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
    const db = loadDb();
    const newApp: LocalApplication = {
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
    db.applications.push(newApp);
    saveDb(db);
    return newApp;
  },

  updateApplication(id: string, updates: Partial<LocalApplication>): LocalApplication | null {
    const db = loadDb();
    const idx = db.applications.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    db.applications[idx] = {
      ...db.applications[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    return db.applications[idx];
  },

  getApplication(id: string): LocalApplication | null {
    const db = loadDb();
    return db.applications.find((a) => a.id === id) || null;
  },

  getAuditLogs(appId: string): LocalAuditLog[] {
    const db = loadDb();
    return db.auditLogs
      .filter((l) => l.applicationId === appId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  createAuditLog(log: Omit<LocalAuditLog, 'id' | 'createdAt'>): LocalAuditLog {
    const db = loadDb();
    const newLog: LocalAuditLog = {
      id: crypto.randomUUID(),
      ...log,
      createdAt: new Date().toISOString(),
    };
    db.auditLogs.push(newLog);
    saveDb(db);
    return newLog;
  },

  getChanges(): LocalChangeRequest[] {
    const db = loadDb();
    return db.changes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  createChange(data: Omit<LocalChangeRequest, 'id' | 'createdAt' | 'status' | 'approvedBy'>): LocalChangeRequest {
    const db = loadDb();
    const newChange: LocalChangeRequest = {
      id: crypto.randomUUID(),
      ...data,
      status: 'DRAFT',
      approvedBy: null,
      createdAt: new Date().toISOString(),
    };
    db.changes.push(newChange);
    saveDb(db);
    return newChange;
  },

  updateChange(id: string, updates: Partial<LocalChangeRequest>): LocalChangeRequest | null {
    const db = loadDb();
    const idx = db.changes.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    db.changes[idx] = { ...db.changes[idx], ...updates };
    saveDb(db);
    return db.changes[idx];
  },

  getProblems(): LocalProblem[] {
    const db = loadDb();
    return db.problems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  createProblem(data: Omit<LocalProblem, 'id' | 'createdAt' | 'status' | 'rootCause' | 'workaround'>): LocalProblem {
    const db = loadDb();
    const newProblem: LocalProblem = {
      id: crypto.randomUUID(),
      ...data,
      status: 'NEW',
      rootCause: null,
      workaround: null,
      createdAt: new Date().toISOString(),
    };
    db.problems.push(newProblem);
    saveDb(db);
    return newProblem;
  },

  updateProblem(id: string, updates: Partial<LocalProblem>): LocalProblem | null {
    const db = loadDb();
    const idx = db.problems.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    db.problems[idx] = { ...db.problems[idx], ...updates };
    saveDb(db);
    return db.problems[idx];
  },

  getArticles(statusFilter?: string): LocalArticle[] {
    const db = loadDb();
    let res = db.articles;
    if (statusFilter) {
      res = res.filter((a) => a.status === statusFilter);
    }
    return res.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  createArticle(data: Omit<LocalArticle, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: string }): LocalArticle {
    const db = loadDb();
    const newArt: LocalArticle = {
      id: crypto.randomUUID(),
      ...data,
      status: data.status || 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.articles.push(newArt);
    saveDb(db);
    return newArt;
  },

  updateArticle(id: string, updates: Partial<LocalArticle>): LocalArticle | null {
    const db = loadDb();
    const idx = db.articles.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    db.articles[idx] = {
      ...db.articles[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    return db.articles[idx];
  },

  searchArticles(query: string): { id: string; title: string; category: string }[] {
    const db = loadDb();
    const q = query.toLowerCase();
    return db.articles
      .filter((a) => a.status === 'PUBLISHED' && (a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)))
      .map((a) => ({ id: a.id, title: a.title, category: a.category }));
  },
};
