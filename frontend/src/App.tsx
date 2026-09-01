import React, { Fragment, useState, useEffect, useMemo } from 'react';
import { AuditTimeline } from './components/AuditTimeline';
import { ChangeBoard } from './components/ChangeBoard';
import { ProblemBoard } from './components/ProblemBoard';
import { KnowledgeBoard } from './components/KnowledgeBoard';
import { Dashboard } from './components/Dashboard';
import { NomenclatureForm } from './components/NomenclatureForm';
import { useUser } from './context/UserContext';

interface ServiceCatalog {
  id: string;
  name: string;
  category: string;
  description: string | null;
  defaultType?: string;
}

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
  payload?: any;
  requesterEmail?: string | null;
  bv?: number | null;
  r?: number | null;
  tc?: number | null;
  wsjf?: number | null;
  dueDate?: string | null;
  clickupTaskId?: string | null;
}

const API = '/api/applications';
const SERVICES_API = '/api/services';

const PRIORITY_TONES: Record<string, { bg: string; text: string; border: string; dot: string; pCode: string }> = {
  CRITICAL: { bg: '#FBE8E6', text: '#8E1F19', border: '#F3CFCB', dot: '#C22B22', pCode: 'P1' },
  HIGH: { bg: '#FDF1DC', text: '#92580A', border: '#F3DFB8', dot: '#D97706', pCode: 'P2' },
  MEDIUM: { bg: '#E4F1F3', text: '#235C68', border: '#C7E1E5', dot: '#2F7D8C', pCode: 'P3' },
  LOW: { bg: '#F1ECE7', text: '#6A5D53', border: '#E1D8D0', dot: '#8B7D72', pCode: 'P4' },
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: 'P1 · Критичний',
  HIGH: 'P2 · Високий',
  MEDIUM: 'P3 · Середній',
  LOW: 'P4 · Низький',
};

const STATUS_CONFIG: Record<string, { label: string; text: string; bg: string; border: string }> = {
  NEW: { label: 'Новий', text: '#245A87', bg: '#E7F0F8', border: '#CBDFEE' },
  TZ_PREPARATION: { label: 'Підготовка ТЗ', text: '#5D4483', bg: '#F0EAF8', border: '#DDD0EE' },
  PENDING_APPROVAL: { label: 'Очікує погодження', text: '#8A5E0C', bg: '#FBF1DE', border: '#EEDDB6' },
  APPROVED: { label: 'Погоджено', text: '#1F5D45', bg: '#E5F3ED', border: '#C6E3D6' },
  TRIAGE: { label: 'Тріаж', text: '#96491F', bg: '#FBEBE1', border: '#F0D5C2' },
  ESTIMATION: { label: 'Оцінка / WSJF', text: '#38457F', bg: '#EAECF8', border: '#D2D7EE' },
  IN_PROGRESS: { label: 'В роботі', text: '#175C69', bg: '#E3F1F4', border: '#C4E2E8' },
  TESTING: { label: 'Тестування', text: '#6B3B7B', bg: '#F4E9F8', border: '#E4CFEE' },
  UAT: { label: 'UAT', text: '#235F54', bg: '#E4F1EE', border: '#C4E1DA' },
  RESOLVED: { label: 'Вирішено', text: '#2C5F22', bg: '#EAF3E6', border: '#D0E4C8' },
  CLOSED: { label: 'Закрито', text: '#6A5D53', bg: '#F1ECE7', border: '#E1D8D0' },
  REJECTED: { label: 'Відхилено', text: '#8E1F19', bg: '#FBE8E6', border: '#F3CFCB' },
};

const NEXT_STATUS: Record<string, string[]> = {
  NEW: ['TZ_PREPARATION', 'PENDING_APPROVAL', 'TRIAGE', 'IN_PROGRESS', 'REJECTED'],
  TZ_PREPARATION: ['ESTIMATION', 'TZ_PREPARATION', 'REJECTED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS', 'RESOLVED'],
  TRIAGE: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  ESTIMATION: ['IN_PROGRESS', 'TZ_PREPARATION', 'REJECTED'],
  IN_PROGRESS: ['TESTING', 'UAT', 'RESOLVED', 'TZ_PREPARATION', 'REJECTED'],
  TESTING: ['UAT', 'IN_PROGRESS'],
  UAT: ['RESOLVED', 'TZ_PREPARATION', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: ['NEW', 'TZ_PREPARATION', 'PENDING_APPROVAL'],
};

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

function App() {
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

  // WSJF Prioritization sliders (1-5)
  const [bv, setBv] = useState(4);
  const [risk, setRisk] = useState(3);
  const [tc, setTc] = useState(4);

  // Impact x Urgency matrix states
  const [impact, setImpact] = useState('high');
  const [urgency, setUrgency] = useState('high');

  // UI Navigation & Feedback states
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'incidents' | 'changes' | 'problems' | 'kb' | 'dashboard'>('incidents');
  const [suggestions, setSuggestions] = useState<{ id: string; title: string; category: string }[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'HIGH'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [rejectModalAppId, setRejectModalAppId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const calculatedWsjf = useMemo(() => {
    return Number((((bv + risk + tc) / 3) * 2).toFixed(1));
  }, [bv, risk, tc]);

  // Sync priority with Impact x Urgency
  const calculatePriorityFromMatrix = (i: string, u: string) => {
    const map: Record<string, string> = {
      'high-high': 'CRITICAL',
      'high-mid': 'HIGH',
      'high-low': 'MEDIUM',
      'mid-high': 'HIGH',
      'mid-mid': 'MEDIUM',
      'mid-low': 'MEDIUM',
      'low-high': 'MEDIUM',
      'low-mid': 'LOW',
      'low-low': 'LOW',
    };
    return map[`${i}-${u}`] || 'LOW';
  };

  const handleMatrixSelect = (newImpact: string, newUrgency: string) => {
    setImpact(newImpact);
    setUrgency(newUrgency);
    const newPrio = calculatePriorityFromMatrix(newImpact, newUrgency);
    setPriority(newPrio);
  };

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4000);
  };

  // Filter services by type (Incident vs Service Request)
  const visibleServices = useMemo(() => {
    return services.filter((svc) => {
      const isIncident =
        svc.name === 'Зупинка виробництва' ||
        svc.defaultType === 'INCIDENT' ||
        svc.category.toLowerCase().includes('інцидент') ||
        svc.category.toLowerCase().includes('incident');
      return type === 'INCIDENT' ? isIncident : !isIncident;
    });
  }, [services, type]);

  const isNomenclatureService = useMemo(() => {
    const selected = services.find((s) => s.id === serviceCatalogId);
    return selected?.name.includes('номенклатур') || serviceCatalogId === 'srv-3';
  }, [services, serviceCatalogId]);

  const handleTypeChange = (newType: string) => {
    setType(newType);
    if (newType === 'INCIDENT') {
      setPriority('CRITICAL');
      setFormType('C');
      const incSvc = services.find(
        (s) =>
          s.name === 'Зупинка виробництва' ||
          s.defaultType === 'INCIDENT' ||
          s.category.toLowerCase().includes('інцидент') ||
          s.category.toLowerCase().includes('incident'),
      );
      if (incSvc) {
        setServiceCatalogId(incSvc.id);
      }
    } else {
      if (priority === 'CRITICAL') setPriority('LOW');
      setFormType('A');
      const curSvc = services.find((s) => s.id === serviceCatalogId);
      if (curSvc?.name === 'Зупинка виробництва' || (curSvc as any)?.defaultType === 'INCIDENT') {
        setServiceCatalogId('');
      }
    }
  };

  const handleServiceSelect = (serviceId: string) => {
    setServiceCatalogId(serviceId);
    const selected = services.find((s) => s.id === serviceId);
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

  useEffect(() => {
    if (tab !== 'incidents') return;
    const timer = setTimeout(async () => {
      if (description.length < 3) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/kb/search?q=${encodeURIComponent(description)}`);
        setSuggestions(await res.json());
      } catch {
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [description, tab]);

  const filteredApplications = useMemo(() => {
    let result = Array.isArray(applications) ? applications : [];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (app) =>
          (app.applicantName || '').toLowerCase().includes(q) ||
          (app.description || '').toLowerCase().includes(q) ||
          (app.service?.name || '').toLowerCase().includes(q) ||
          (app.id || '').toLowerCase().includes(q),
      );
    }
    if (filter === 'OVERDUE') {
      const now = new Date();
      result = result.filter(
        (app) => app.slaDeadline && new Date(app.slaDeadline) < now && app.status !== 'RESOLVED' && app.status !== 'CLOSED',
      );
    } else if (filter === 'HIGH') {
      result = result.filter((app) => app.priority === 'HIGH' || app.priority === 'CRITICAL');
    }
    return result;
  }, [applications, filter, searchQuery]);

  const fetchApplications = async () => {
    try {
      const res = await fetch(API);
      const data = await res.json();
      setApplications(Array.isArray(data) ? data : []);
    } catch {
      setApplications([]);
    }
  };

  const fetchServices = async () => {
    try {
      const res = await fetch(SERVICES_API);
      const data = await res.json();
      setServices(Array.isArray(data) ? data : []);
    } catch {
      setServices([]);
    }
  };

  useEffect(() => {
    fetchApplications();
    fetchServices();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Construct payload object for specific form types
    const payloadObj: Record<string, any> = {};
    if (url) payloadObj.url = url;
    if (roleField) payloadObj.role = roleField;
    if (licenseField) payloadObj.license = licenseField;
    if (formType === 'B' && subtype === 'Вивантаження') {
      payloadObj.exportParams = { format: exportFormat, requestedAt: new Date().toISOString() };
    }

    try {
      const res = await fetch(API, {
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
          payload: Object.keys(payloadObj).length ? payloadObj : undefined,
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

      if (!res.ok) {
        const err = await res.json();
        alert(`Помилка створення заявки: ${err.error || 'Перевірте поля'}`);
        return;
      }

      const created = await res.json();
      triggerToast(`Заявку #${created.id.slice(0, 8)} успішно створено`);

      // Reset form
      setApplicantName('');
      setDescription('');
      setUrl('');
      setDueDate('');
      setRoleField('');
      setLicenseField('');
      setServiceCatalogId('');
      fetchApplications();
    } catch (err: any) {
      alert(`Помилка підключення до сервера: ${err.message}`);
    }
  };

  const handleStatusChange = async (appId: string, newStatus: string, note?: string) => {
    if (newStatus === 'REJECTED' && !note) {
      setRejectModalAppId(appId);
      return;
    }

    try {
      const res = await fetch(`${API}/${appId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify({
          status: newStatus,
          changedBy: `${role.toLowerCase()}@ham.local`,
          actorRole: role,
          resolutionNote: newStatus === 'RESOLVED' ? (note || 'Вирішено та протестовано') : undefined,
          rejectionReason: newStatus === 'REJECTED' ? note : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Помилка зміни статусу: ${err.error || 'Недопустимий перехід'}`);
        return;
      }

      triggerToast(`Статус оновлено на «${STATUS_CONFIG[newStatus]?.label || newStatus}»`);
      fetchApplications();
    } catch (err: any) {
      alert(`Помилка: ${err.message}`);
    }
  };

  const handleConfirmRejection = () => {
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
            ].map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    active
                      ? 'bg-[#E8663B] text-white shadow-sm'
                      : 'text-[#5A4E45] hover:bg-[#F5EFE9] hover:text-[#1E1712]'
                  }`}
                >
                  {t.label}
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
                onSuccess={(msg) => {
                  triggerToast(msg);
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
                    <h2 className="text-base font-bold text-[#1E1712]">Створити нову заявку</h2>
                  </div>
                  <span className="text-xs font-mono text-[#8B7D72]">WSJF · SLA · ITIL</span>
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
                      onChange={(e) => setApplicantName(e.target.value)}
                      placeholder="Введіть ім'я та прізвище"
                      className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#5A4E45]">Email заявника</label>
                    <input
                      type="email"
                      value={requesterEmail}
                      onChange={(e) => setRequesterEmail(e.target.value)}
                      placeholder="user@company.local"
                      className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B] focus:ring-2 focus:ring-[#FDEDE5] transition-all"
                    />
                  </div>
                </div>

                {/* Type, Service & Form Type */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#5A4E45]">Тип заявки</label>
                    <select
                      value={type}
                      onChange={(e) => handleTypeChange(e.target.value)}
                      className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] transition-all"
                    >
                      <option value="SERVICE_REQUEST">Запит на обслуговування</option>
                      <option value="INCIDENT">Інцидент</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#5A4E45]">Сервіс каталогу</label>
                    <select
                      value={serviceCatalogId}
                      onChange={(e) => handleServiceSelect(e.target.value)}
                      className="text-sm text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3 outline-none focus:border-[#E8663B] transition-all"
                    >
                      <option value="">— Оберіть сервіс —</option>
                      {(() => {
                        const grouped = visibleServices.reduce<Record<string, ServiceCatalog[]>>(
                          (acc, svc) => {
                            (acc[svc.category] ||= []).push(svc);
                            return acc;
                          },
                          {},
                        );
                        return Object.entries(grouped).map(([cat, svcs]) => (
                          <optgroup key={cat} label={cat}>
                            {svcs.map((svc) => (
                              <option key={svc.id} value={svc.id}>
                                {svc.name}
                              </option>
                            ))}
                          </optgroup>
                        ));
                      })()}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[#5A4E45]">Напрямок / Підтип</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={formType}
                        onChange={(e) => setFormType(e.target.value)}
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
                        onChange={(e) => setSubtype(e.target.value)}
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
                        Посилання на звіт / сторінку <span className="text-[#C22B22]">*</span>
                      </label>
                      <input
                        type="url"
                        required
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://bi.company.local/reports/sales-report"
                        className="text-sm font-mono text-[#1E1712] bg-white border border-[#E8663B] rounded-xl h-10 px-3.5 outline-none ring-2 ring-[#FDEDE5]"
                      />
                      <span className="text-[11px] text-[#8B7D72]">Обов'язкове для підтипу «Доробка»</span>
                    </div>
                  )}

                  {tc >= 4 && (
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-xs font-semibold text-[#C22B22]">
                        Кінцевий термін (Due Date) <span className="text-[#C22B22]">* (TC ≥ 4)</span>
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="text-sm text-[#1E1712] bg-white border border-[#C22B22] rounded-xl h-10 px-3.5 outline-none ring-2 ring-[#FBE8E6]"
                      />
                      <span className="text-[11px] text-[#C22B22] font-medium">
                        Обов'язковий через високу критичність за часом (Time Criticality ≥ 4)
                      </span>
                    </div>
                  )}

                  {formType === 'D' && subtype === 'Доступ' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#5A4E45]">
                        Запитувана роль <span className="text-[#C22B22]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={roleField}
                        onChange={(e) => setRoleField(e.target.value)}
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
                        onChange={(e) => setLicenseField(e.target.value)}
                        placeholder="напр. Power BI Pro / JetBrains"
                        className="text-sm font-mono text-[#1E1712] bg-white border border-[#DED4CA] rounded-xl h-10 px-3.5 outline-none focus:border-[#E8663B]"
                      />
                    </div>
                  )}

                  {formType === 'B' && subtype === 'Вивантаження' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-[#5A4E45]">Формат вивантаження</label>
                      <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value)}
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
                        <span className="font-mono text-[#C7522F] font-bold">{bv}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={bv}
                        onChange={(e) => setBv(+e.target.value)}
                        className="w-full accent-[#E8663B]"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium text-[#5A4E45]">
                        <span>Risk Reduction / Opportunity</span>
                        <span className="font-mono text-[#C7522F] font-bold">{risk}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={risk}
                        onChange={(e) => setRisk(+e.target.value)}
                        className="w-full accent-[#E8663B]"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium text-[#5A4E45]">
                        <span>Time Criticality</span>
                        <span className="font-mono text-[#C7522F] font-bold">{tc}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={tc}
                        onChange={(e) => setTc(+e.target.value)}
                        className="w-full accent-[#E8663B]"
                      />
                    </div>
                  </div>

                  {/* Impact x Urgency Matrix */}
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
                      <div className="text-[10px] text-[#8B7D72] text-center font-semibold">Висока</div>
                      <div className="text-[10px] text-[#8B7D72] text-center font-semibold">Середня</div>
                      <div className="text-[10px] text-[#8B7D72] text-center font-semibold">Низька</div>

                      {[
                        ['high', 'Високий'],
                        ['mid', 'Середній'],
                        ['low', 'Низький'],
                      ].map(([iKey, iLabel]) => (
                        <Fragment key={iKey}>
                          <div className="text-[10px] text-[#8B7D72] flex items-center justify-end pr-1.5 font-medium">
                            {iLabel}
                          </div>
                          {['high', 'mid', 'low'].map((uKey) => {
                            const pName = calculatePriorityFromMatrix(iKey, uKey);
                            const pTone = PRIORITY_TONES[pName] || PRIORITY_TONES.LOW;
                            const isSel = impact === iKey && urgency === uKey;
                            return (
                              <button
                                key={`${iKey}-${uKey}`}
                                type="button"
                                onClick={() => handleMatrixSelect(iKey, uKey)}
                                className={`h-8 rounded-lg font-mono text-xs font-bold flex items-center justify-center transition-all ${
                                  isSel ? 'ring-2 ring-[#E8663B] shadow-sm scale-105' : 'opacity-85 hover:opacity-100'
                                }`}
                                style={{
                                  backgroundColor: pTone.bg,
                                  color: pTone.text,
                                  border: `1px solid ${isSel ? pTone.text : pTone.border}`,
                                }}
                              >
                                {pTone.pCode}
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
                  <label className="text-xs font-semibold text-[#5A4E45]">Опис запиту або проблеми</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
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
                      {suggestions.map((s) => (
                        <li key={s.id} className="text-xs text-[#6B4126] hover:underline cursor-pointer">
                          📄 <span className="font-semibold">{s.title}</span>{' '}
                          <span className="text-[#8B7D72] font-mono">({s.category})</span>
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
                    onChange={(e) => setSearchQuery(e.target.value)}
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
                    const sel = filter === chip.id;
                    return (
                      <button
                        key={chip.id}
                        onClick={() => setFilter(chip.id as any)}
                        className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all ${
                          sel ? 'bg-white text-[#1E1712] shadow-sm' : 'text-[#8B7D72] hover:text-[#1E1712]'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Table */}
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
                    {filteredApplications.map((app) => {
                      const isExpanded = expandedId === app.id;
                      const pTone = PRIORITY_TONES[app.priority] || PRIORITY_TONES.LOW;
                      const sTone = STATUS_CONFIG[app.status] || STATUS_CONFIG.NEW;
                      const isBreached =
                        app.slaDeadline &&
                        new Date(app.slaDeadline) < new Date() &&
                        !['RESOLVED', 'CLOSED'].includes(app.status);

                      return (
                        <Fragment key={app.id}>
                          <tr
                            onClick={() => setExpandedId(isExpanded ? null : app.id)}
                            className={`cursor-pointer hover:bg-[#FBF8F5] transition-colors ${
                              isExpanded ? 'bg-[#FDEDE5]/30' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-mono text-xs text-[#8B7D72]">
                              #{app.id.slice(0, 8)}
                            </td>
                            <td className="py-3 px-4 text-xs font-semibold text-[#1E1712] max-w-xs truncate">
                              {app.description || app.service?.name || 'Заявка без опису'}
                            </td>
                            <td className="py-3 px-4 text-xs text-[#5A4E45]">
                              {app.service?.name || (app.type === 'INCIDENT' ? 'Інцидент' : 'Запит')}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md text-white"
                                style={{ backgroundColor: pTone.dot }}
                              >
                                {pTone.pCode}
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className="text-xs font-semibold px-2.5 py-0.5 rounded-lg border"
                                style={{
                                  backgroundColor: sTone.bg,
                                  color: sTone.text,
                                  borderColor: sTone.border,
                                }}
                              >
                                {sTone.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs text-[#5A4E45] whitespace-nowrap">
                              {app.applicantName}
                            </td>
                            <td className="py-3 px-4 text-xs font-mono text-[#8B7D72] whitespace-nowrap">
                              {new Date(app.createdAt).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                            </td>
                          </tr>

                          {/* EXPANDED ROW */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="p-5 bg-[#FBF8F5] border-b border-[#EDE5DD]">
                                <div className="space-y-4">
                                  {/* Detailed information grid */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-white rounded-xl border border-[#EDE5DD]">
                                    <div>
                                      <div className="text-[11px] font-mono text-[#8B7D72]">SLA ДЕДЛАЙН</div>
                                      <div className={`text-xs font-semibold ${isBreached ? 'text-[#C22B22] font-bold' : 'text-[#1E1712]'}`}>
                                        {app.slaDeadline ? new Date(app.slaDeadline).toLocaleString() : '—'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] font-mono text-[#8B7D72]">WSJF ОЦІНКА</div>
                                      <div className="text-xs font-mono font-bold text-[#E8663B]">
                                        Score: {app.wsjf ?? '—'} (BV:{app.bv ?? '—'} R:{app.r ?? '—'} TC:{app.tc ?? '—'})
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] font-mono text-[#8B7D72]">EMAIL / POC</div>
                                      <div className="text-xs text-[#1E1712]">
                                        {app.requesterEmail || '—'}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Status Transition Action Buttons */}
                                  {NEXT_STATUS[app.status]?.length > 0 && (
                                    <div className="flex items-center flex-wrap gap-2 pt-1">
                                      <span className="text-xs font-semibold text-[#5A4E45] mr-1">
                                        Перевести статус:
                                      </span>
                                      {NEXT_STATUS[app.status].map((next) => {
                                        const nTone = STATUS_CONFIG[next] || STATUS_CONFIG.NEW;
                                        return (
                                          <button
                                            key={next}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleStatusChange(app.id, next);
                                            }}
                                            className="text-xs font-semibold px-3 py-1 rounded-xl border shadow-sm transition-all hover:scale-105"
                                            style={{
                                              backgroundColor: nTone.bg,
                                              color: nTone.text,
                                              borderColor: nTone.border,
                                            }}
                                          >
                                            {STATUS_ACTION_LABELS[next] || next}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Audit Log Timeline */}
                                  <div className="bg-white rounded-xl p-4 border border-[#EDE5DD]">
                                    <AuditTimeline appId={app.id} />
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
                            <div className="text-sm font-bold text-[#1E1712]">Тут поки порожньо</div>
                            <div className="text-xs text-[#5A4E45] max-w-sm">
                              Носуха все обнюхала й не знайшла жодної заявки. Подайте першу форму зверху — і вона з'явиться тут.
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
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-[#1E1712]">Відхилити заявку?</h3>
              <p className="text-xs text-[#5A4E45] leading-relaxed">
                Автор отримає сповіщення. Будь ласка, вкажіть причину відхилення — вона буде записана в аудит-журнал.
              </p>
            </div>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
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
            <div className="text-xs font-bold text-[#1E1712]">{toastMessage}</div>
            <div className="text-[11px] text-[#8B7D72] font-mono">Синхронізовано з PostgreSQL</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
