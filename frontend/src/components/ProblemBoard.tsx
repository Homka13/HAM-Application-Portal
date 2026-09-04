/**
 * @file ProblemBoard.tsx
 * @description ITIL Problem Management dashboard component for logging,
 * analyzing root causes (RCA), documenting known errors with workarounds,
 * and tracking problem resolution lifecycles.
 *
 * Requirements Addressed:
 * - ITIL Problem Management: Structured progression through root cause analysis.
 * - Role-Based Actions: Only users with 'ADMIN' role can create problems,
 *   initiate RCA, and transition statuses.
 * - Known Error Database (KEDB): Captures verified root causes and temporary
 *   workarounds before formal problem resolution.
 */

import React, { useState, useEffect, Fragment } from 'react';
import { useUser } from '../context/UserContext';

/**
 * Problem record structure representing an identified systemic issue.
 */
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

/** Base REST endpoint for ITIL problem management operations. */
const API = '/api/problems';

/**
 * Deterministic status transition state machine for problem records:
 * NEW -> RCA (Root Cause Analysis) -> KNOWN_ERROR -> RESOLVED.
 */
const PROBLEM_WORKFLOW: Record<string, string[]> = {
  NEW: ['RCA'],
  RCA: ['KNOWN_ERROR'],
  KNOWN_ERROR: ['RESOLVED'],
  RESOLVED: [],
};

/** Localized UI display labels for problem lifecycle states. */
const STATUS_LABELS: Record<string, string> = {
  NEW: 'Нова',
  RCA: 'Аналіз причин',
  KNOWN_ERROR: 'Відома помилка',
  RESOLVED: 'Вирішено',
};

/** Tailwind CSS badge color classes mapping each problem status. */
const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-gray-100 text-gray-700',
  RCA: 'bg-yellow-100 text-yellow-800',
  KNOWN_ERROR: 'bg-orange-100 text-orange-800',
  RESOLVED: 'bg-green-100 text-green-800',
};

/** Action button text for transitioning between problem states. */
const ACTION_LABELS: Record<string, string> = {
  RCA: 'Розслідувати',
  KNOWN_ERROR: 'Зафіксувати помилку',
  RESOLVED: 'Вирішити',
};

/**
 * ProblemBoard component rendering the list of open and resolved problems,
 * along with administrative tools for root-cause diagnosis.
 *
 * @returns {React.ReactElement} The rendered Problem Management view.
 */
export const ProblemBoard: React.FC = () => {
  const { role } = useUser();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rootCause, setRootCause] = useState<Record<string, string>>({});
  const [workaround, setWorkaround] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /**
   * Fetches problem records from the server and updates state.
   */
  const fetchProblems = async (): Promise<void> => {
    try {
      const response = await fetch(API);
      const data = await response.json();
      setProblems(Array.isArray(data) ? data : []);
    } catch {
      setProblems([]);
    }
  };

  useEffect(() => {
    fetchProblems();
  }, []);

  /**
   * Handles submission of a new problem record (restricted to Admins).
   *
   * @param {React.FormEvent} event - The form submission event.
   */
  const handleCreate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
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
    await fetchProblems();
  };

  /**
   * Transitions a problem to a new lifecycle state, attaching root cause
   * and workaround text when entering KNOWN_ERROR status.
   *
   * @param {string} id - The unique problem identifier.
   * @param {string} newStatus - Target status from the allowed workflow.
   */
  const handleStatusChange = async (
    id: string,
    newStatus: string
  ): Promise<void> => {
    const payload: Record<string, string> = { status: newStatus };
    if (newStatus === 'KNOWN_ERROR') {
      payload.rootCause = rootCause[id] || '';
      payload.workaround = workaround[id] || '';
    }

    await fetch(`${API}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': role,
      },
      body: JSON.stringify(payload),
    });

    setRootCause((previous) => ({ ...previous, [id]: '' }));
    setWorkaround((previous) => ({ ...previous, [id]: '' }));
    setExpandedId(null);
    await fetchProblems();
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
              onChange={(event) => setTitle(event.target.value)}
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
              onChange={(event) => setDescription(event.target.value)}
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
            {problems.map((problemItem) => {
              const isExpanded = expandedId === problemItem.id;
              const nextStatuses = PROBLEM_WORKFLOW[problemItem.status] || [];
              const showRcaFields =
                isExpanded &&
                role === 'ADMIN' &&
                nextStatuses.includes('KNOWN_ERROR');

              return (
                <Fragment key={problemItem.id}>
                  <tr
                    onClick={() =>
                      setExpandedId(isExpanded ? null : problemItem.id)
                    }
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{problemItem.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                        {problemItem.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          STATUS_COLORS[problemItem.status] ||
                          'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {STATUS_LABELS[problemItem.status] || problemItem.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate">
                      {problemItem.rootCause || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-[200px] truncate">
                      {problemItem.workaround || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {problemItem.applications?.length ?? 0}
                    </td>
                    {role === 'ADMIN' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-1">
                          {nextStatuses.map((nextStatus) => (
                            <button
                              key={nextStatus}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (nextStatus === 'KNOWN_ERROR') {
                                  if (!isExpanded) {
                                    setExpandedId(problemItem.id);
                                    return;
                                  }
                                  handleStatusChange(problemItem.id, nextStatus);
                                } else {
                                  handleStatusChange(problemItem.id, nextStatus);
                                }
                              }}
                              className={`px-2 py-1 text-xs font-medium rounded ${
                                nextStatus === 'RCA'
                                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                  : nextStatus === 'KNOWN_ERROR'
                                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              {ACTION_LABELS[nextStatus] || nextStatus}
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
                              value={rootCause[problemItem.id] || ''}
                              onChange={(event) =>
                                setRootCause((previous) => ({
                                  ...previous,
                                  [problemItem.id]: event.target.value,
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
                              value={workaround[problemItem.id] || ''}
                              onChange={(event) =>
                                setWorkaround((previous) => ({
                                  ...previous,
                                  [problemItem.id]: event.target.value,
                                }))
                              }
                              placeholder="Як тимчасово обійти проблему?"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                            />
                          </div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStatusChange(problemItem.id, 'KNOWN_ERROR');
                            }}
                            className="px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                          >
                            Зафіксувати як відому помилку
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
