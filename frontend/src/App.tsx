/**
 * @file App.tsx
 * @description Root application component orchestrating the complete HAM
 * Application Portal interface. Provides navigation tabs across:
 * - Applications (ITSM tickets with branches A–E, WSJF scoring, Impact × Urgency matrix,
 *   SLA deadline tracking, status transitions, and audit timeline).
 * - Change Management (CAB review board, risk classification, approval workflow).
 * - Problem Management (ITIL problem board, root cause analysis, KEDB workarounds).
 * - Knowledge Base (Operational troubleshooting guides, markdown rendering).
 * - Executive Dashboard (Real-time KPIs and D3.js vector visualizations).
 * - Specialized ERP Nomenclature intake (Form A subtype «Номенклатура»).
 *
 * Requirements Addressed:
 * - Enterprise ITSM Workflow: Implements the 12-status state machine with
 *   role-based permissioning and rejection reason audit logging.
 * - Prioritization Standards: Calculates WSJF Cost of Delay and resolves
 *   P1–P4 priority from Impact × Urgency dimensions.
 * - Subtype Guardrails: Dynamically validates and requires URLs for «Доробка»,
 *   due dates for Time Criticality >= 4, and role/license fields for Form D.
 */

import React, { Fragment, useState, useEffect, useMemo } from 'react';
import { AuditTimeline } from './components/AuditTimeline';
import { ChangeBoard } from './components/ChangeBoard';
import { ProblemBoard } from './components/ProblemBoard';
import { KnowledgeBoard } from './components/KnowledgeBoard';
import { Dashboard } from './components/Dashboard';
import { NomenclatureForm } from './components/NomenclatureForm';
import { useUser } from './context/UserContext';

/**
 * Service catalog descriptor loaded from the backend catalog registry.
 */
interface ServiceCatalog {
  id: string;
  name: string;
  category: string;
  description: string | null;
  defaultType?: string;
}

/**
 * Full application/incident record reflecting backend database state.
 */
interface Application {
  id: string;
  applicantName: string;
  type: string;
  priority: string;
  status: string;
  description: string | null;
  assignee: string | null;
  slaDeadline?: string;
  serviceCatalogId?: string;
  service?: ServiceCatalog;
  createdAt: string;
  formType?: string | null;
  subtype?: string | null;
  payload?: Record<string, unknown>;
  requesterEmail?: string | null;
  bv?: number | null;
  r?: number | null;
  tc?: number | null;
  wsjf?: number | null;
  dueDate?: string | null;
  clickupTaskId?: string | null;
}

/** Base REST endpoint for application and ticket management. */
const API = '/api/applications';

/** REST endpoint for retrieving published service catalog entries. */
const SERVICES_API = '/api/services';

/** Visual color tokens and codes for each priority level. */
const PRIORITY_TONES: Record<
  string,
  { bg: string; text: string; border: string; dot: string; pCode: string }
> = {
  CRITICAL: {
    bg: '#FBE8E6',
    text: '#8E1F19',
    border: '#F3CFCB',
    dot: '#C22B22',
    pCode: 'P1',
  },
  HIGH: {
    bg: '#FDF1DC',
    text: '#92580A',
    border: '#F3DFB8',
    dot: '#D97706',
    pCode: 'P2',
  },
  MEDIUM: {
    bg: '#E4F1F3',
    text: '#235C68',
    border: '#C7E1E5',
    dot: '#2F7D8C',
    pCode: 'P3',
  },
  LOW: {
    bg: '#F1ECE7',
    text: '#6A5D53',
    border: '#E1D8D0',
    dot: '#8B7D72',
    pCode: 'P4',
  },
};

/** Ukrainian display labels for priority levels. */
const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'P1 · Критичний',
  HIGH: 'P2 · Високий',
  MEDIUM: 'P3 · Середній',
  LOW: 'P4 · Низький',
};

/** Visual badge tokens and labels for all 12 ITSM statuses. */
const STATUS_CONFIG: Record<
  string,
  { label: string; text: string; bg: string; border: string }
> = {
  NEW: {
    label: 'Новий',
    text: '#245A87',
    bg: '#E7F0F8',
    border: '#CBDFEE',
  },
  TZ_PREPARATION: {
    label: 'Підготовка ТЗ',
    text: '#5D4483',
    bg: '#F0EAF8',
    border: '#DDD0EE',
  },
  PENDING_APPROVAL: {
    label: 'Очікує погодження',
    text: '#8A5E0C',
    bg: '#FBF1DE',
    border: '#EEDDB6',
  },
  APPROVED: {
    label: 'Погоджено',
    text: '#1F5D45',
    bg: '#E5F3ED',
    border: '#C6E3D6',
  },
  TRIAGE: {
    label: 'Тріаж',
    text: '#96491F',
    bg: '#FBEBE1',
    border: '#F0D5C2',
  },
  ESTIMATION: {
    label: 'Оцінка / WSJF',
    text: '#38457F',
    bg: '#EAECF8',
    border: '#D2D7EE',
  },
  IN_PROGRESS: {
    label: 'В роботі',
    text: '#175C69',
    bg: '#E3F1F4',
    border: '#C4E2E8',
  },
  TESTING: {
    label: 'Тестування',
    text: '#6B3B7B',
    bg: '#F4E9F8',
    border: '#E4CFEE',
  },
  UAT: {
    label: 'UAT',
    text: '#235F54',
    bg: '#E4F1EE',
    border: '#C4E1DA',
  },
  RESOLVED: {
    label: 'Вирішено',
    text: '#2C5F22',
    bg: '#EAF3E6',
    border: '#D0E4C8',
  },
  CLOSED: {
    label: 'Закрито',
    text: '#6A5D53',
    bg: '#F1ECE7',
    border: '#E1D8D0',
  },
  REJECTED: {
    label: 'Відхилено',
    text: '#8E1F19',
    bg: '#FBE8E6',
    border: '#F3CFCB',
  },
};

/** Deterministic state transition workflow across all 12 ticket states. */
const NEXT_STATUS: Record<string, string[]> = {
  NEW: [
    'TZ_PREPARATION',
    'PENDING_APPROVAL',
    'TRIAGE',
    'IN_PROGRESS',
    'REJECTED',
  ],
  TZ_PREPARATION: ['ESTIMATION', 'TZ_PREPARATION', 'REJECTED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS', 'RESOLVED'],
  TRIAGE: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  ESTIMATION: ['IN_PROGRESS', 'TZ_PREPARATION', 'REJECTED'],
  IN_PROGRESS: [
    'TESTING',
    'UAT',
    'RESOLVED',
    'TZ_PREPARATION',
    'REJECTED',
  ],
  TESTING: ['UAT', 'IN_PROGRESS'],
  UAT: ['RESOLVED', 'TZ_PREPARATION', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: ['NEW', 'TZ_PREPARATION', 'PENDING_APPROVAL'],
};

/** Button action labels for transitioning between lifecycle states. */
const STATUS_ACTION_LABELS: Record<string, string> = {
  TZ_PREPARATION: 'ТЗ / Уточнення',
  PENDING_APPROVAL: 'На погодження',
  APPROVED: 'Погодити',
  TRIAGE: 'На тріаж',
  ESTIMATION: 'На оцінку',
  IN_PROGRESS: 'В роботу',
  TESTING: 'На тестування',
  UAT: 'На UAT',
  RESOLVED: 'Вирішити',
  CLOSED: 'Закрити',
  REJECTED: 'Відхилити',
};

/**
 * Root portal application component.
 *
 * @returns {React.ReactElement} The rendered HAM Application Portal application.
 */
function App(): React.ReactElement {
  const { role } = useUser();
  const [applications, setApplications] = useState<Application[]>([]);
  const [services, setServices] = useState<ServiceCatalog[]>([]);

  // Form states
  const [applicantName, setApplicantName] = useState('');
  const [type, setType] = useState('SERVICE_REQUEST');
  const [priority, setPriority] = useState('LOW');
  const [description, setDescription] = useState('');
  const [serviceCatalogId, setServiceCatalogId] = useState('');
  const [formType, setFormType] = useState('A');
  const [subtype, setSubtype] = useState('');
  const [url, setUrl] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [roleField, setRoleField] = useState('');
  const [licenseField, setLicenseField] = useState('');
  const [exportFormat, setExportFormat] = useState('XLSX');
  const [requesterEmail, setRequesterEmail] = useState('');

  // WSJF Prioritization sliders (1–5 scale)
  const [bv, setBv] = useState(4);
  const [risk, setRisk] = useState(3);
  const [tc, setTc] = useState(4);

  // Impact × Urgency matrix states
  const [impact, setImpact] = useState('high');
  const [urgency, setUrgency] = useState('high');

  // UI Navigation & Feedback states
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<
    'incidents' | 'changes' | 'problems' | 'kb' | 'dashboard'
  >('incidents');
  const [suggestions, setSuggestions] = useState<
    { id: string; title: string; category: string }[]
  >([]);
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'HIGH'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [rejectModalAppId, setRejectModalAppId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  /**
   * WSJF formula: ((BV + RR + TC) / 3) * 2
   */
  const calculatedWsjf = useMemo(() => {
    return Number((((bv + risk + tc) / 3) * 2).toFixed(1));
  }, [bv, risk, tc]);

  /**
   * Maps Impact and Urgency dimensions into standard ITIL priority tiers.
   *
   * @param {string} impactLevel - 'high', 'mid', or 'low'.
   * @param {string} urgencyLevel - 'high', 'mid', or 'low'.
   * @returns {string} Target priority enum value.
   */
  const calculatePriorityFromMatrix = (
    impactLevel: string,
    urgencyLevel: string
  ): string => {
    const map: Record<string, string> = {
      'high-high': 'CRITICAL',
      'high-mid': 'HIGH',
      'high-low': 'MEDIUM',
      'mid-high': 'HIGH',
      'mid-mid': 'MEDIUM',
      'mid-low': 'MEDIUM',
      'low-high': 'MEDIUM',
      'low-low': 'LOW',
      'low-mid': 'LOW',
    };
    return map[`${impactLevel}-${urgencyLevel}`] || 'LOW';
  };

  /**
   * Handles user selection within the Impact × Urgency matrix grid.
   *
   * @param {string} newImpact - Selected impact level.
   * @param {string} newUrgency - Selected urgency level.
   */
  const handleMatrixSelect = (newImpact: string, newUrgency: string): void => {
    setImpact(newImpact);
    setUrgency(newUrgency);
    const newPriority = calculatePriorityFromMatrix(newImpact, newUrgency);
    setPriority(newPriority);
  };

  /**
   * Displays an interactive toast notification with auto-dismiss after 4 seconds.
   *
   * @param {string} message - Notification text.
   */
  const triggerToast = (message: string): void => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((currentMessage) =>
        currentMessage === message ? null : currentMessage
      );
    }, 4000);
  };

  /** Filters visible services based on current request type (Incident vs Request). */
  const visibleServices = useMemo(() => {
    return services.filter((service) => {
      const isIncident =
        service.name === 'Зупинка виробництва' ||
        service.defaultType === 'INCIDENT' ||
        service.category.toLowerCase().includes('інцидент') ||
        service.category.toLowerCase().includes('incident');
      return type === 'INCIDENT' ? isIncident : !isIncident;
    });
  }, [services, type]);

  /** Checks whether the chosen service represents the ERP Nomenclature workflow. */
  const isNomenclatureService = useMemo(() => {
    const selected = services.find(
      (service) => service.id === serviceCatalogId
    );
    return (
      selected?.name.includes('номенклатур') || serviceCatalogId === 'srv-3'
    );
  }, [services, serviceCatalogId]);

  /**
   * Updates application type and resets conflicting default priorities and forms.
   *
   * @param {string} newType - 'INCIDENT' or 'SERVICE_REQUEST'.
   */
  const handleTypeChange = (newType: string): void => {
    setType(newType);
    if (newType === 'INCIDENT') {
      setPriority('CRITICAL');
      setFormType('C');
      const incidentService = services.find(
        (service) =>
          service.name === 'Зупинка виробництва' ||
          service.defaultType === 'INCIDENT' ||
          service.category.toLowerCase().includes('інцидент') ||
          service.category.toLowerCase().includes('incident')
      );
      if (incidentService) {
        setServiceCatalogId(incidentService.id);
      }
    } else {
      if (priority === 'CRITICAL') setPriority('LOW');
      setFormType('A');
      const currentService = services.find(
        (service) => service.id === serviceCatalogId
      );
      if (
        currentService?.name === 'Зупинка виробництва' ||
        currentService?.defaultType === 'INCIDENT'
      ) {
        setServiceCatalogId('');
      }
    }
  };

  /**
   * Adapts form type and priority to match selected catalog item defaults.
   *
   * @param {string} serviceId - Selected catalog service ID.
   */
  const handleServiceSelect = (serviceId: string): void => {
    setServiceCatalogId(serviceId);
    const selected = services.find((service) => service.id === serviceId);
    if (selected) {
      const isIncident =
        selected.name === 'Зупинка виробництва' ||
        selected.defaultType === 'INCIDENT' ||
        selected.category.toLowerCase().includes('інцидент') ||
        selected.category.toLowerCase().includes('incident');
      if (isIncident) {
        setType('INCIDENT');
        setPriority('CRITICAL');
        setFormType('C');
      } else {
        setType('SERVICE_REQUEST');
        if (priority === 'CRITICAL') setPriority('LOW');
        if (selected.name.includes('доступу')) {
          setFormType('D');
          setSubtype('Доступ');
        } else {
          setFormType('A');
        }
      }
    }
  };

  // Debounced search for relevant KB articles matching user description
  useEffect(() => {
    if (tab !== 'incidents') return;
    const timer = setTimeout(async () => {
      if (description.length < 3) {
        setSuggestions([]);
        return;
      }
      try {
        const response = await fetch(
          `/api/kb/search?q=${encodeURIComponent(description)}`
        );
        setSuggestions(await response.json());
      } catch {
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [description, tab]);

  /** Filtered applications based on search query and quick filter buttons. */
  const filteredApplications = useMemo(() => {
    let result = Array.isArray(applications) ? applications : [];
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (app) =>
          (app.applicantName || '').toLowerCase().includes(query) ||
          (app.description || '').toLowerCase().includes(query) ||
          (app.service?.name || '').toLowerCase().includes(query) ||
          (app.id || '').toLowerCase().includes(query)
      );
    }
    if (filter === 'OVERDUE') {
      const now = new Date();
      result = result.filter(
        (app) =>
          app.slaDeadline &&
          new Date(app.slaDeadline) < now &&
          app.status !== 'RESOLVED' &&
          app.status !== 'CLOSED'
      );
    } else if (filter === 'HIGH') {
      result = result.filter(
        (app) => app.priority === 'HIGH' || app.priority === 'CRITICAL'
      );
    }
    return result;
  }, [applications, filter, searchQuery]);

  /** Fetches latest applications from the API. */
  const fetchApplications = async (): Promise<void> => {
    try {
      const response = await fetch(API);
      const data = await response.json();
      setApplications(Array.isArray(data) ? data : []);
    } catch {
      setApplications([]);
    }
  };

  /** Fetches service catalog items from the API. */
  const fetchServices = async (): Promise<void> => {
    try {
      const response = await fetch(SERVICES_API);
      const data = await response.json();
      setServices(Array.isArray(data) ? data : []);
    } catch {
      setServices([]);
    }
  };

  useEffect(() => {
    fetchApplications();
    fetchServices();
  }, []);

  /**
   * Submits new application to the backend API.
   *
   * @param {React.FormEvent} event - The form submission event.
   */
  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();

    // Construct specialized payload object for form subtypes
    const payloadObject: Record<string, unknown> = {};
    if (url) payloadObject.url = url;
    if (roleField) payloadObject.role = roleField;
    if (licenseField) payloadObject.license = licenseField;
    if (formType === 'B' && subtype === 'Вивантаження') {
      payloadObject.exportParams = {
        format: exportFormat,
        requestedAt: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantName,
          type,
          priority,
          description,
          serviceCatalogId: serviceCatalogId || undefined,
          formType: formType || undefined,
          subtype: subtype || undefined,
          payload:
            Object.keys(payloadObject).length > 0 ? payloadObject : undefined,
          requesterEmail: requesterEmail || undefined,
          bv,
          r: risk,
          tc,
          wsjf: calculatedWsjf,
          impact,
          urgency,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Помилка створення заявки: ${errorData.error || 'Перевірте поля'}`);
        return;
      }

      const created = await response.json();
      triggerToast(`Заявку #${created.id.slice(0, 8)} успішно створено`);

      // Reset form controls
      setApplicantName('');
      setDescription('');
      setUrl('');
      setDueDate('');
      setRoleField('');
      setLicenseField('');
      setServiceCatalogId('');
      await fetchApplications();
    } catch (networkError: unknown) {
      const message =
        networkError instanceof Error
          ? networkError.message
          : String(networkError);
      alert(`Помилка підключення до сервера: ${message}`);
    }
  };

  /**
   * Changes status of an application, prompting for rejection reason if required.
   *
   * @param {string} applicationId - Target ticket ID.
   * @param {string} newStatus - Destination status.
   * @param {string} [note] - Optional resolution or rejection explanation.
   */
  const handleStatusChange = async (
    applicationId: string,
    newStatus: string,
    note?: string
  ): Promise<void> => {
    if (newStatus === 'REJECTED' && !note) {
      setRejectModalAppId(applicationId);
      return;
    }

    try {
      const response = await fetch(`${API}/${applicationId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify({
          status: newStatus,
          changedBy: `${role.toLowerCase()}@ham.local`,
          actorRole: role,
          resolutionNote:
            newStatus === 'RESOLVED'
              ? note || 'Вирішено та протестовано'
              : undefined,
          rejectionReason: newStatus === 'REJECTED' ? note : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(
          `Помилка зміни статусу: ${
            errorData.error || 'Недопустимий перехід'
          }`
        );
        return;
      }

      triggerToast(
        `Статус оновлено на «${
          STATUS_CONFIG[newStatus]?.label || newStatus
        }»`
      );
      await fetchApplications();
    } catch (networkError: unknown) {
      const message =
        networkError instanceof Error
          ? networkError.message
          : String(networkError);
      alert(`Помилка: ${message}`);
    }
  };

  /**
   * Confirms ticket rejection with mandatory audit reason.
   */
  const handleConfirmRejection = (): void => {
    if (!rejectModalAppId) return;
    if (!rejectReason.trim()) {
      alert('Будь ласка, вкажіть причину відхилення для аудит-журналу');
      return;
    }
    handleStatusChange(rejectModalAppId, 'REJECTED', rejectReason);
    setRejectModalAppId(null);
    setRejectReason('');
  };

  return (
    <div className="min-h-screen bg-[#FBF8F5] text-[#1E1712] font-sans antialiased">
      {/* 1. STICKY HEADER */}
      <header className="sticky top-0 z-30 bg-[#FBF8F5]/90 backdrop-blur-md border-b border-[#EDE5DD]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/mascot.png"
              alt="Маскот носуха"
              className="w-8 h-8 rounded-lg object-cover shadow-sm"
            />
            <span className="text-sm font-bold tracking-tight text-[#1E1712]">
              Портал запитів та заявок
            </span>
          </div>

          {/* TAB SWITCHER */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {[
              { id: 'incidents', label: '📋 Заявки' },
              { id: 'changes', label: '🔄 Зміни' },
              { id: 'problems', label: '🔍 Проблеми' },
              { id: 'kb', label: '📚 База знань' },
              { id: 'dashboard', label: '📊 Дашборд' },
            ].map((tabItem) => {
              const active = tab === tabItem.id;
              return (
                <button
                  key={tabItem.id}
                  onClick={() => setTab(tabItem.id as never)}
                  className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    active
                      ? 'bg-[#E8663B] text-white shadow-sm'
                      : 'text-[#5A4E45] hover:bg-[#F5EFE9] hover:text-[#1E1712]'
                  }`}
                >
                  {tabItem.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* 2. MAIN CONTENT CONTAINER */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {tab === 'incidents' && (
          <div className="space-y-10">
            {/* HERO INTRODUCTION */}
            <div className="py-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E1712]">
                Єдине вікно запитів та інцидентів
              </h1>
            </div>

            {/* 3. APPLICATION CREATION FORM OR NOMENCLATURE FORM */}
            {isNomenclatureService ? (
              <NomenclatureForm
                serviceId={serviceCatalogId}
                onSuccess={(message) => {
                  triggerToast(message);
                  setServiceCatalogId('');
                  fetchApplications();
                }}
                onCancel={() => setServiceCatalogId('')}
              />
            ) : (
              <section className="bg-white border border-[#EDE5DD] rounded-2xl p-6 sm:p-7 shadow-[0_2px_12px_rgba(62,36,23,0.03)] space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-[#F2EBE4]">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#E8663B]" />
                    <h2 className="text-base font-bold text-[#1E1712]">
                      Створити нову заявку
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-[#8B7D72]">
                    WSJF · SLA · ITIL
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Applicant & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#5A4E45]">
                        Ім'я заявника <span className="text-[#C22B22]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={applicantName}
                        onChange={(event) =>
                          setApplicantName(event.target.value)
                        }
                        placeholder="Введіть ім'я та прізвище"
                        className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#5A4E45]">
                        Email заявника
                      </label>
                      <input
                        type="email"
                        value={requesterEmail}
                        onChange={(event) =>
                          setRequesterEmail(event.target.value)
                        }
                        placeholder="user@company.local"
                        className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] transition-all"
                      />
                    </div>
                  </div>

                  {/* Type, Service & Form Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#5A4E45]">
                        Тип заявки
                      </label>
                      <select
                        value={type}
                        onChange={(event) =>
                          handleTypeChange(event.target.value)
                        }
                        className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] transition-all"
                      >
                        <option value="SERVICE_REQUEST">
                          Запит на обслуговування
                        </option>
                        <option value="INCIDENT">Інцидент</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#5A4E45]">
                        Сервіс каталогу
                      </label>
                      <select
                        value={serviceCatalogId}
                        onChange={(event) =>
                          handleServiceSelect(event.target.value)
                        }
                        className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] transition-all"
                      >
                        <option value="">— Оберіть сервіс —</option>
                        {(() => {
                          const grouped = visibleServices.reduce<
                            Record<string, ServiceCatalog[]>
                          >((accumulator, service) => {
                            (accumulator[service.category] ||= []).push(
                              service
                            );
                            return accumulator;
                          }, {});
                          return Object.entries(grouped).map(
                            ([categoryName, serviceList]) => (
                              <optgroup
                                key={categoryName}
                                label={categoryName}
                              >
                                {serviceList.map((service) => (
                                  <option key={service.id} value={service.id}>
                                    {service.name}
                                  </option>
                                ))}
                              </optgroup>
                            )
                          );
                        })()}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#5A4E45]">
                        Напрямок / Підтип
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={formType}
                          onChange={(event) => setFormType(event.target.value)}
                          className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-2 outline-none focus:border-[#E8663B]"
                        >
                          <option value="A">Розробка / Новий звіт</option>
                          <option value="B">Ad-hoc / Вивантаження</option>
                          <option value="C">Інцидент</option>
                          <option value="D">Доступ / Ліцензія</option>
                          <option value="E">Консультація</option>
                        </select>
                        <select
                          value={subtype}
                          onChange={(event) => setSubtype(event.target.value)}
                          className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-2 outline-none focus:border-[#E8663B]"
                        >
                          <option value="">Без підтипу</option>
                          <option value="Доробка">Доробка</option>
                          <option value="Вивантаження">Вивантаження</option>
                          <option value="Доступ">Доступ</option>
                          <option value="Ліцензія">Ліцензія</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Conditional fields based on rules */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {subtype === 'Доробка' && (
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-xs font-semibold text-[#5A4E45]">
                          Посилання на звіт / сторінку{' '}
                          <span className="text-[#C22B22]">*</span>
                        </label>
                        <input
                          type="url"
                          required
                          value={url}
                          onChange={(event) => setUrl(event.target.value)}
                          placeholder="https://bi.company.local/reports/sales-report"
                          className="text-sm font-mono text-[#1E1712] bg-white border border-[#E8663B] rounded-xl h-10 px-3.5 outline-none ring-2 ring-[#FDEDE5]"
                        />
                        <span className="text-[11px] text-[#8B7D72]">
                          Обов'язкове для підтипу «Доробка»
                        </span>
                      </div>
                    )}

                    {tc >= 4 && (
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-xs font-semibold text-[#C22B22]">
                          Кінцевий термін (Due Date){' '}
                          <span className="text-[#C22B22]">* (TC ≥ 4)</span>
                        </label>
                        <input
                          type="datetime-local"
                          required
                          value={dueDate}
                          onChange={(event) => setDueDate(event.target.value)}
                          className="text-sm text-[#1E1712] bg-white border border-[#C22B22] rounded-xl h-10 px-3.5 outline-none ring-2 ring-[#FBE8E6]"
                        />
                        <span className="text-[11px] text-[#C22B22] font-medium">
                          Обов'язковий через високу критичність за часом (Time
                          Criticality ≥ 4)
                        </span>
                      </div>
                    )}

                    {formType === 'D' && subtype === 'Доступ' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-[#5A4E45]">
                          Запитувана роль{' '}
                          <span className="text-[#C22B22]">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={roleField}
                          onChange={(event) =>
                            setRoleField(event.target.value)
                          }
                          placeholder="напр. BI_FINANCE_VIEWER"
                          className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
                        />
                      </div>
                    )}

                    {formType === 'D' && subtype === 'Ліцензія' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-[#5A4E45]">
                          Тип ліцензії <span className="text-[#C22B22]">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={licenseField}
                          onChange={(event) =>
                            setLicenseField(event.target.value)
                          }
                          placeholder="напр. Power BI Pro / JetBrains"
                          className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
                        />
                      </div>
                    )}

                    {formType === 'B' && subtype === 'Вивантаження' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-[#5A4E45]">
                          Формат вивантаження
                        </label>
                        <select
                          value={exportFormat}
                          onChange={(event) =>
                            setExportFormat(event.target.value)
                          }
                          className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none"
                        >
                          <option value="XLSX">Excel (XLSX)</option>
                          <option value="CSV">CSV</option>
                          <option value="PARQUET">Parquet</option>
                          <option value="JSON">JSON</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* 4. WSJF CALCULATOR & IMPACT x URGENCY MATRIX */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-[#F2EBE4]">
                    {/* WSJF Sliders */}
                    <div className="bg-[#FBF8F5] border border-[#EDE5DD] rounded-2xl p-4 sm:p-5 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#5A4E45] font-mono">
                          Оцінка цінності (WSJF)
                        </span>
                        <span className="font-mono text-sm font-bold text-[#E8663B] bg-[#FDEDE5] px-2.5 py-0.5 rounded-lg border border-[#F9CDB4]">
                          WSJF {calculatedWsjf}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-[#5A4E45]">
                          <span>Business Value</span>
                          <span className="font-mono text-[#C7522F] font-bold">
                            {bv}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={bv}
                          onChange={(event) => setBv(+event.target.value)}
                          className="w-full accent-[#E8663B]"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-[#5A4E45]">
                          <span>Risk Reduction / Opportunity</span>
                          <span className="font-mono text-[#C7522F] font-bold">
                            {risk}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={risk}
                          onChange={(event) => setRisk(+event.target.value)}
                          className="w-full accent-[#E8663B]"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-[#5A4E45]">
                          <span>Time Criticality</span>
                          <span className="font-mono text-[#C7522F] font-bold">
                            {tc}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          value={tc}
                          onChange={(event) => setTc(+event.target.value)}
                          className="w-full accent-[#E8663B]"
                        />
                      </div>
                    </div>

                    {/* Impact × Urgency Matrix */}
                    <div className="bg-[#FBF8F5] border border-[#EDE5DD] rounded-2xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#5A4E45] font-mono">
                          Матриця Impact × Urgency
                        </span>
                        <span className="text-xs font-semibold text-[#1E1712]">
                          {PRIORITY_LABELS[priority] || priority}
                        </span>
                      </div>

                      <div className="grid grid-cols-[64px_repeat(3,1fr)] gap-1.5 pt-1">
                        <div />
                        <div className="text-[10px] text-[#8B7D72] text-center font-semibold">
                          Висока
                        </div>
                        <div className="text-[10px] text-[#8B7D72] text-center font-semibold">
                          Середня
                        </div>
                        <div className="text-[10px] text-[#8B7D72] text-center font-semibold">
                          Низька
                        </div>

                        {[
                          ['high', 'Високий'],
                          ['mid', 'Середній'],
                          ['low', 'Низький'],
                        ].map(([impactKey, impactLabel]) => (
                          <Fragment key={impactKey}>
                            <div className="text-[10px] text-[#8B7D72] flex items-center justify-end pr-1.5 font-medium">
                              {impactLabel}
                            </div>
                            {['high', 'mid', 'low'].map((urgencyKey) => {
                              const priorityName =
                                calculatePriorityFromMatrix(
                                  impactKey,
                                  urgencyKey
                                );
                              const priorityTone =
                                PRIORITY_TONES[priorityName] ||
                                PRIORITY_TONES.LOW;
                              const isSelected =
                                impact === impactKey && urgency === urgencyKey;
                              return (
                                <button
                                  key={`${impactKey}-${urgencyKey}`}
                                  type="button"
                                  onClick={() =>
                                    handleMatrixSelect(impactKey, urgencyKey)
                                  }
                                  className={`h-8 rounded-lg font-mono text-xs font-bold flex items-center justify-center transition-all ${
                                    isSelected
                                      ? 'ring-2 ring-[#E8663B] shadow-sm scale-105'
                                      : 'opacity-85 hover:opacity-100'
                                  }`}
                                  style={{
                                    backgroundColor: priorityTone.bg,
                                    color: priorityTone.text,
                                    border: `1px solid ${
                                      isSelected
                                        ? priorityTone.text
                                        : priorityTone.border
                                    }`,
                                  }}
                                >
                                  {priorityTone.pCode}
                                </button>
                              );
                            })}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Description & KB Suggestions */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#5A4E45]">
                      Опис запиту або проблеми
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(event) =>
                        setDescription(event.target.value)
                      }
                      placeholder="Детально опишіть проблему, контекст або критерії готовності..."
                      className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl p-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] resize-none transition-all"
                    />
                  </div>

                  {suggestions.length > 0 && (
                    <div className="bg-[#FDEDE5] border border-[#F9CDB4] rounded-2xl p-4 space-y-2">
                      <div className="text-xs font-bold text-[#8E1F19] flex items-center gap-2">
                        <span>💡</span> Можливо, це вам допоможе з Бази знань:
                      </div>
                      <ul className="space-y-1.5">
                        {suggestions.map((suggestion) => (
                          <li
                            key={suggestion.id}
                            className="text-xs text-[#6B4126] hover:underline cursor-pointer"
                          >
                            📄{' '}
                            <span className="font-semibold">
                              {suggestion.title}
                            </span>{' '}
                            <span className="text-[#8B7D72] font-mono">
                              ({suggestion.category})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Submit Action Buttons */}
                  <div className="flex gap-3 items-center pt-2">
                    <button
                      type="submit"
                      className="text-sm font-semibold text-white bg-[#E8663B] hover:bg-[#C7522F] border border-[#E8663B] rounded-xl px-6 h-10 shadow-sm transition-colors cursor-pointer"
                    >
                      Подати запит
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setApplicantName('');
                        setDescription('');
                        setUrl('');
                      }}
                      className="text-sm font-semibold text-[#5A4E45] hover:bg-[#F5EFE9] hover:text-[#1E1712] rounded-xl px-4 h-10 transition-colors"
                    >
                      Очистити
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* 4. APPLICATIONS TABLE SECTION */}
            <section className="bg-white border border-[#EDE5DD] rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(62,36,23,0.03)]">
              {/* Search and Filters Bar */}
              <div className="p-3.5 sm:px-5 flex flex-wrap gap-3 items-center justify-between border-b border-[#EDE5DD] bg-[#FBF8F5]">
                <div className="flex-1 min-w-[240px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Пошук за номером, автором або описом..."
                    className="w-full text-xs sm:text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-9 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5]"
                  />
                </div>

                <div className="flex gap-1.5 bg-[#F5EFE9] p-1 rounded-xl">
                  {[
                    { id: 'ALL', label: 'Усі' },
                    { id: 'OVERDUE', label: '🔴 Прострочені' },
                    { id: 'HIGH', label: '🔥 Високий пріоритет' },
                  ].map((chip) => {
                    const selected = filter === chip.id;
                    return (
                      <button
                        key={chip.id}
                        onClick={() => setFilter(chip.id as never)}
                        className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all ${
                          selected
                            ? 'bg-white text-[#1E1712] shadow-sm'
                            : 'text-[#8B7D72] hover:text-[#1E1712]'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Applications Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#FBF8F5] border-b border-[#EDE5DD]">
                      <th className="text-left font-mono text-[11px] font-semibold text-[#8B7D72] uppercase tracking-wider py-2.5 px-4">
                        №
                      </th>
                      <th className="text-left font-mono text-[11px] font-semibold text-[#8B7D72] uppercase tracking-wider py-2.5 px-4">
                        Назва / Опис
                      </th>
                      <th className="text-left font-mono text-[11px] font-semibold text-[#8B7D72] uppercase tracking-wider py-2.5 px-4">
                        Сервіс
                      </th>
                      <th className="text-left font-mono text-[11px] font-semibold text-[#8B7D72] uppercase tracking-wider py-2.5 px-4">
                        Пріоритет
                      </th>
                      <th className="text-left font-mono text-[11px] font-semibold text-[#8B7D72] uppercase tracking-wider py-2.5 px-4">
                        Статус
                      </th>
                      <th className="text-left font-mono text-[11px] font-semibold text-[#8B7D72] uppercase tracking-wider py-2.5 px-4">
                        Автор
                      </th>
                      <th className="text-left font-mono text-[11px] font-semibold text-[#8B7D72] uppercase tracking-wider py-2.5 px-4">
                        Дата
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2EBE4]">
                    {filteredApplications.map((application) => {
                      const isExpanded = expandedId === application.id;
                      const priorityTone =
                        PRIORITY_TONES[application.priority] ||
                        PRIORITY_TONES.LOW;
                      const statusTone =
                        STATUS_CONFIG[application.status] ||
                        STATUS_CONFIG.NEW;
                      const isBreached =
                        application.slaDeadline &&
                        new Date(application.slaDeadline) < new Date() &&
                        !['RESOLVED', 'CLOSED'].includes(application.status);

                      return (
                        <Fragment key={application.id}>
                          <tr
                            onClick={() =>
                              setExpandedId(isExpanded ? null : application.id)
                            }
                            className={`cursor-pointer hover:bg-[#FBF8F5] transition-colors ${
                              isExpanded ? 'bg-[#FDEDE5]/30' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-mono text-xs text-[#8B7D72]">
                              #{application.id.slice(0, 8)}
                            </td>
                            <td className="py-3 px-4 text-xs font-semibold text-[#1E1712] max-w-xs truncate">
                              {application.description ||
                                application.service?.name ||
                                'Заявка без опису'}
                            </td>
                            <td className="py-3 px-4 text-xs text-[#5A4E45]">
                              {application.service?.name ||
                                (application.type === 'INCIDENT'
                                  ? 'Інцидент'
                                  : 'Запит')}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md text-white"
                                style={{ backgroundColor: priorityTone.dot }}
                              >
                                {priorityTone.pCode}
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className="text-xs font-semibold px-2.5 py-0.5 rounded-lg border"
                                style={{
                                  backgroundColor: statusTone.bg,
                                  color: statusTone.text,
                                  borderColor: statusTone.border,
                                }}
                              >
                                {statusTone.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-[#5A4E45] whitespace-nowrap">
                              {application.applicantName}
                            </td>
                            <td className="py-3 px-4 text-xs font-mono text-[#8B7D72] whitespace-nowrap">
                              {new Date(
                                application.createdAt
                              ).toLocaleDateString([], {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </td>
                          </tr>

                          {/* EXPANDED ROW */}
                          {isExpanded && (
                            <tr>
                              <td
                                colSpan={7}
                                className="p-5 bg-[#FBF8F5] border-b border-[#EDE5DD]"
                              >
                                <div className="space-y-4">
                                  {/* Detailed information grid */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white rounded-xl border border-[#EDE5DD]">
                                    <div>
                                      <div className="text-[11px] font-mono text-[#8B7D72]">
                                        SLA ДЕДЛАЙН
                                      </div>
                                      <div
                                        className={`text-xs font-semibold ${
                                          isBreached
                                            ? 'text-[#C22B22] font-bold'
                                            : 'text-[#1E1712]'
                                        }`}
                                      >
                                        {application.slaDeadline
                                          ? new Date(
                                              application.slaDeadline
                                            ).toLocaleString()
                                          : '—'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] font-mono text-[#8B7D72]">
                                        WSJF ОЦІНКА
                                      </div>
                                      <div className="text-xs font-mono font-bold text-[#E8663B]">
                                        Score: {application.wsjf ?? '—'} (BV:
                                        {application.bv ?? '—'} R:
                                        {application.r ?? '—'} TC:
                                        {application.tc ?? '—'})
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] font-mono text-[#8B7D72]">
                                        EMAIL / POC
                                      </div>
                                      <div className="text-xs text-[#1E1712]">
                                        {application.requesterEmail || '—'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Status Transition Action Buttons */}
                                  {NEXT_STATUS[application.status]?.length >
                                    0 && (
                                    <div className="flex items-center flex-wrap gap-2 pt-1">
                                      <span className="text-xs font-semibold text-[#5A4E45] mr-1">
                                        Перевести статус:
                                      </span>
                                      {NEXT_STATUS[application.status].map(
                                        (nextStatus) => {
                                          const nextTone =
                                            STATUS_CONFIG[nextStatus] ||
                                            STATUS_CONFIG.NEW;
                                          return (
                                            <button
                                              key={nextStatus}
                                              type="button"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                handleStatusChange(
                                                  application.id,
                                                  nextStatus
                                                );
                                              }}
                                              className="text-xs font-semibold px-3 py-1 rounded-xl border shadow-sm transition-all hover:scale-105"
                                              style={{
                                                backgroundColor: nextTone.bg,
                                                color: nextTone.text,
                                                borderColor: nextTone.border,
                                              }}
                                            >
                                              {STATUS_ACTION_LABELS[
                                                nextStatus
                                              ] || nextStatus}
                                            </button>
                                          );
                                        }
                                      )}
                                    </div>
                                  )}

                                  {/* Audit Log Timeline */}
                                  <div className="bg-white rounded-xl p-4 border border-[#EDE5DD]">
                                    <AuditTimeline appId={application.id} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}

                    {applications.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 px-4 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <img
                              src="/mascot-preview.png"
                              alt="Порожній стан"
                              className="w-16 h-16 rounded-2xl opacity-90"
                            />
                            <div className="text-sm font-bold text-[#1E1712]">
                              Тут поки порожньо
                            </div>
                            <div className="text-xs text-[#5A4E45] max-w-sm">
                              Носуха все обнюхала й не знайшла жодної заявки.
                              Подайте першу форму зверху — і вона з'явиться тут.
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === 'changes' && <ChangeBoard />}
        {tab === 'problems' && <ProblemBoard />}
        {tab === 'kb' && <KnowledgeBoard />}
        {tab === 'dashboard' && <Dashboard />}
      </main>

      {/* 5. REJECTION MODAL */}
      {rejectModalAppId && (
        <div
          className="fixed inset-0 z-50 bg-[#1E1712]/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRejectModalAppId(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-[#1E1712]">
                Відхилити заявку?
              </h3>
              <p className="text-xs text-[#5A4E45] leading-relaxed">
                Автор отримає сповіщення. Будь ласка, вкажіть причину відхилення
                — вона буде записана в аудит-журнал.
              </p>
            </div>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Вкажіть причину відхилення..."
              className="text-xs text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl p-3 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] resize-none"
            />
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setRejectModalAppId(null)}
                className="text-xs font-semibold text-[#5A4E45] hover:bg-[#F5EFE9] rounded-xl px-4 h-9"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleConfirmRejection}
                className="text-xs font-semibold text-white bg-[#C22B22] hover:bg-[#A31F18] rounded-xl px-4 h-9 shadow-sm"
              >
                Відхилити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex gap-3 p-3.5 px-4 bg-white border border-[#EDE5DD] rounded-2xl shadow-2xl animate-toast">
          <div className="w-2.5 h-2.5 rounded-full bg-[#2C7A5A] mt-1.5 flex-shrink-0" />
          <div className="flex flex-col">
            <div className="text-xs font-bold text-[#1E1712]">
              {toastMessage}
            </div>
            <div className="text-[11px] text-[#8B7D72] font-mono">
              Синхронізовано з PostgreSQL
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
