import { useState, useEffect } from 'react';

interface ServiceCatalog {
  id: string;
  name: string;
  category: string;
  description: string | null;
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
}

const API = 'http://localhost:3000/api/applications';
const SERVICES_API = 'http://localhost:3000/api/services';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Низький',
  MEDIUM: 'Середній',
  HIGH: 'Високий',
  CRITICAL: 'Критичний',
};

const TYPE_LABELS: Record<string, string> = {
  SERVICE_REQUEST: 'Запит',
  INCIDENT: 'Інцидент',
};

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Новий',
  IN_PROGRESS: 'В роботі',
  RESOLVED: 'Вирішено',
  CLOSED: 'Закрито',
};

function App() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [services, setServices] = useState<ServiceCatalog[]>([]);
  const [applicantName, setApplicantName] = useState('');
  const [type, setType] = useState('SERVICE_REQUEST');
  const [priority, setPriority] = useState('LOW');
  const [description, setDescription] = useState('');
  const [serviceCatalogId, setServiceCatalogId] = useState('');

  const fetchApplications = async () => {
    const res = await fetch(API);
    const data = await res.json();
    setApplications(data);
  };

  const fetchServices = async () => {
    const res = await fetch(SERVICES_API);
    const data = await res.json();
    setServices(data);
  };

  useEffect(() => {
    fetchApplications();
    fetchServices();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicantName,
        type,
        priority,
        description,
        serviceCatalogId: serviceCatalogId || undefined,
      }),
    });
    setApplicantName('');
    setDescription('');
    setServiceCatalogId('');
    fetchApplications();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
          Портал заявок HAM
        </h1>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow p-6 mb-8 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ім'я заявника
            </label>
            <input
              type="text"
              value={applicantName}
              onChange={(e) => setApplicantName(e.target.value)}
              placeholder="Введіть ім'я заявника"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="SERVICE_REQUEST">Запит на обслуговування</option>
                <option value="INCIDENT">Інцидент</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Пріоритет
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="LOW">Низький</option>
                <option value="MEDIUM">Середній</option>
                <option value="HIGH">Високий</option>
                <option value="CRITICAL">Критичний</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Сервіс
            </label>
            <select
              value={serviceCatalogId}
              onChange={(e) => setServiceCatalogId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Оберіть сервіс —</option>
              {(() => {
                const grouped = services.reduce<Record<string, ServiceCatalog[]>>(
                  (acc, svc) => {
                    (acc[svc.category] ||= []).push(svc);
                    return acc;
                  },
                  {}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Опис
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Опишіть запит або інцидент..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Створити
          </button>
        </form>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ім'я
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Сервіс
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Пріоритет
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дедлайн
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дата
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {applications.map((app) => {
                const isBreached =
                  app.slaDeadline &&
                  new Date(app.slaDeadline) < new Date() &&
                  !['RESOLVED', 'CLOSED'].includes(app.status);

                return (
                  <tr key={app.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {app.applicantName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {app.service?.name || (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {app.type === 'INCIDENT' ? '🔴' : '🔧'}{' '}
                      {TYPE_LABELS[app.type] || app.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          PRIORITY_COLORS[app.priority] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {PRIORITY_LABELS[app.priority] || app.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        {STATUS_LABELS[app.status] || app.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {app.slaDeadline ? (
                        <span
                          className={
                            isBreached
                              ? 'text-red-600 font-bold'
                              : 'text-gray-500'
                          }
                        >
                          {new Date(app.slaDeadline).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
              {applications.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    Заявок ще немає.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;

