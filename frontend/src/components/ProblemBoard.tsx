import { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';

interface Problem {
  id: string;
  title: string;
  description: string;
  status: string;
  rootCause: string | null;
  workaround: string | null;
  createdAt: string;
  applications?: { id: string; applicantName: string }[];
}

const API = '/api/problems';

const PROBLEM_WORKFLOW: Record<string, string[]> = {
  NEW: ['RCA'],
  RCA: ['KNOWN_ERROR'],
  KNOWN_ERROR: ['RESOLVED'],
  RESOLVED: [],
};

const STATUS_LABELS: Record<string, string> = {
  NEW: 'Нова',
  RCA: 'Аналіз причин',
  KNOWN_ERROR: 'Відома помилка',
  RESOLVED: 'Вирішено',
};

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-gray-100 text-gray-700',
  RCA: 'bg-yellow-100 text-yellow-800',
  KNOWN_ERROR: 'bg-orange-100 text-orange-800',
  RESOLVED: 'bg-green-100 text-green-800',
};

const ACTION_LABELS: Record<string, string> = {
  RCA: 'Розслідувати',
  KNOWN_ERROR: 'Зафіксувати помилку',
  RESOLVED: 'Вирішити',
};

export const ProblemBoard = () => {
  const { role } = useUser();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rootCause, setRootCause] = useState<Record<string, string>>({});
  const [workaround, setWorkaround] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchProblems = async () => {
    try {
      const res = await fetch(API);
      const data = await res.json();
      setProblems(Array.isArray(data) ? data : []);
    } catch {
      setProblems([]);
    }
  };

  useEffect(() => {
    fetchProblems();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': role,
      },
      body: JSON.stringify({ title, description }),
    });
    setTitle('');
    setDescription('');
    fetchProblems();
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const body: any = { status: newStatus };
    if (newStatus === 'KNOWN_ERROR') {
      body.rootCause = rootCause[id] || '';
      body.workaround = workaround[id] || '';
    }

    await fetch(`${API}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': role,
      },
      body: JSON.stringify(body),
    });
    setRootCause((prev) => ({ ...prev, [id]: '' }));
    setWorkaround((prev) => ({ ...prev, [id]: '' }));
    setExpandedId(null);
    fetchProblems();
  };

  return (
    <div>
      {role === 'ADMIN' && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-lg shadow p-6 mb-8 space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-800">
            Нова проблема
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Назва
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Опис проблеми"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
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
              placeholder="Детальний опис проблеми..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium"
          >
            Створити проблему
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
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Причина
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Workaround
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Тікетів
              </th>
              {role === 'ADMIN' && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Дії
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {problems.map((p) => {
              const isExpanded = expandedId === p.id;
              const nextStatuses = PROBLEM_WORKFLOW[p.status] || [];
              const showRcaFields =
                isExpanded && role === 'ADMIN' && nextStatuses.includes('KNOWN_ERROR');

              return (
                <>
                  <tr
                    key={p.id}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : p.id)
                    }
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                        {p.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {STATUS_LABELS[p.status] || p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate">
                      {p.rootCause || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate">
                      {p.workaround || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {p.applications?.length ?? 0}
                    </td>
                    {role === 'ADMIN' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-1">
                          {nextStatuses.map((next) => (
                            <button
                              key={next}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (next === 'KNOWN_ERROR') {
                                  if (!isExpanded) {
                                    setExpandedId(p.id);
                                    return;
                                  }
                                  handleStatusChange(p.id, next);
                                } else {
                                  handleStatusChange(p.id, next);
                                }
                              }}
                              className={`px-2 py-1 text-xs font-medium rounded ${
                                next === 'RCA'
                                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                  : next === 'KNOWN_ERROR'
                                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              {ACTION_LABELS[next] || next}
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                  {showRcaFields && (
                    <tr>
                      <td
                        colSpan={role === 'ADMIN' ? 6 : 5}
                        className="px-6 py-4 bg-gray-50 border-b"
                      >
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Першопричина (Root Cause)
                            </label>
                            <input
                              type="text"
                              value={rootCause[p.id] || ''}
                              onChange={(e) =>
                                setRootCause((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder="Що спричинило проблему?"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Обхідний шлях (Workaround)
                            </label>
                            <input
                              type="text"
                              value={workaround[p.id] || ''}
                              onChange={(e) =>
                                setWorkaround((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder="Як тимчасово обійти проблему?"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                            />
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(p.id, 'KNOWN_ERROR');
                            }}
                            className="px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                          >
                            Зафіксувати як відому помилку
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {problems.length === 0 && (
              <tr>
                <td
                  colSpan={role === 'ADMIN' ? 6 : 5}
                  className="px-6 py-8 text-center text-sm text-gray-500"
                >
                  Проблем не зареєстровано.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
