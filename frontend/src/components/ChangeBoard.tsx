import { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';

interface ChangeRequest {
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

const API = 'http://localhost:3000/api/changes';

const CHANGE_WORKFLOW: Record<string, string[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['IMPLEMENTED'],
  IMPLEMENTED: [],
  REJECTED: [],
};

const TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Стандартна',
  NORMAL: 'Нормальна',
  EMERGENCY: 'Аварійна',
};

const RISK_LABELS: Record<string, string> = {
  LOW: 'Низький',
  MEDIUM: 'Середній',
  HIGH: 'Високий',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Чернетка',
  PENDING: 'На розгляді',
  APPROVED: 'Затверджено',
  IMPLEMENTED: 'Впроваджено',
  REJECTED: 'Відхилено',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  IMPLEMENTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-800',
  HIGH: 'bg-red-100 text-red-800',
};

const ACTION_LABELS: Record<string, string> = {
  PENDING: 'На розгляд',
  APPROVED: 'Затвердити',
  REJECTED: 'Відхилити',
  IMPLEMENTED: 'Впровадити',
};

export const ChangeBoard = () => {
  const { role } = useUser();
  const [changes, setChanges] = useState<ChangeRequest[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('NORMAL');
  const [risk, setRisk] = useState('MEDIUM');
  const [scheduledAt, setScheduledAt] = useState('');
  const [requestedBy, setRequestedBy] = useState('');

  const fetchChanges = async () => {
    const res = await fetch(API);
    setChanges(await res.json());
  };

  useEffect(() => {
    fetchChanges();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': role,
      },
      body: JSON.stringify({ title, description, type, risk, scheduledAt, requestedBy }),
    });
    setTitle('');
    setDescription('');
    setScheduledAt('');
    setRequestedBy('');
    fetchChanges();
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await fetch(`${API}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': role,
      },
      body: JSON.stringify({
        status: newStatus,
        approvedBy: newStatus === 'APPROVED' ? 'Admin' : undefined,
      }),
    });
    fetchChanges();
  };

  return (
    <div>
      {role === 'ADMIN' && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-lg shadow p-6 mb-8 space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-800">
            Новий запит на зміну
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Назва
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Коротка назва зміни"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="STANDARD">Стандартна</option>
                <option value="NORMAL">Нормальна</option>
                <option value="EMERGENCY">Аварійна</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ризик
              </label>
              <select
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="LOW">Низький</option>
                <option value="MEDIUM">Середній</option>
                <option value="HIGH">Високий</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата впровадження
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ініціатор
            </label>
            <input
              type="text"
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
              placeholder="Хто запитує зміну"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Опис
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Детальний опис зміни..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            Створити запит на зміну
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Назва
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Тип
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Ризик
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Дата
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Ініціатор
              </th>
              {role === 'ADMIN' && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Дії
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {changes.map((ch) => (
              <tr key={ch.id}>
                <td className="px-6 py-4 text-sm text-gray-900">
                  <div className="font-medium">{ch.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                    {ch.description}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                    {TYPE_LABELS[ch.type] || ch.type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      RISK_COLORS[ch.risk] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {RISK_LABELS[ch.risk] || ch.risk}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      STATUS_COLORS[ch.status] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {STATUS_LABELS[ch.status] || ch.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(ch.scheduledAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {ch.requestedBy}
                </td>
                {role === 'ADMIN' && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      {CHANGE_WORKFLOW[ch.status]?.map((next) => (
                        <button
                          key={next}
                          onClick={() => handleStatusChange(ch.id, next)}
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            next === 'APPROVED'
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : next === 'REJECTED'
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : next === 'IMPLEMENTED'
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                          }`}
                        >
                          {ACTION_LABELS[next] || next}
                        </button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {changes.length === 0 && (
              <tr>
                <td
                  colSpan={role === 'ADMIN' ? 7 : 6}
                  className="px-6 py-8 text-center text-sm text-gray-500"
                >
                  Запитів на зміни ще немає.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
