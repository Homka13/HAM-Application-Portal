/**
 * @file frontend/src/components/ChangeBoard.tsx
 * @module components/ChangeBoard
 * @description ITIL Change Management dashboard and intake board.
 *
 * Architectural Role:
 * Provides a specialized administrative view for managing ITIL Change Requests.
 * Facilitates the intake of new change proposals (Standard, Normal, Emergency),
 * risk tier assessments (Low, Medium, High), deployment window scheduling, and
 * lifecycle status progression (`DRAFT` -> `PENDING` -> `APPROVED` / `REJECTED` -> `IMPLEMENTED`).
 *
 * Inputs:
 * - User role context (`useUser()`) enforcing RBAC guards.
 * - HTTP API data from `GET /api/changes`.
 *
 * Outputs:
 * - Interactive change management table and proposal submission form.
 *
 * Constraints & Assumptions:
 * - Only users with the 'ADMIN' role can submit new change requests or trigger transitions.
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useUser } from '../context/UserContext';

/**
 * Change request entity shape displayed on the board.
 */
interface ChangeRequest {
  /** Unique change request identifier. */
  id: string;
  /** Summary title. */
  title: string;
  /** Technical change description. */
  description: string;
  /** Classification (STANDARD, NORMAL, EMERGENCY). */
  type: string;
  /** Risk tier (LOW, MEDIUM, HIGH). */
  risk: string;
  /** Current lifecycle status. */
  status: string;
  /** ISO-8601 scheduled execution timestamp. */
  scheduledAt: string;
  /** Initiating user or team. */
  requestedBy: string;
  /** Authorizing manager or CAB lead. */
  approvedBy: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Linked application tickets. */
  applications?: { id: string; applicantName: string }[];
}

/** Base API route for change requests. */
const API_BASE_URL = '/api/changes';

/**
 * Directed status transitions permitted in the ITIL change lifecycle.
 */
const CHANGE_WORKFLOW: Record<string, string[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['IMPLEMENTED'],
  IMPLEMENTED: [],
  REJECTED: [],
};

/** Ukrainian display labels for change classifications. */
const TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Стандартна',
  NORMAL: 'Нормальна',
  EMERGENCY: 'Аварійна',
};

/** Ukrainian display labels for risk tiers. */
const RISK_LABELS: Record<string, string> = {
  LOW: 'Низький',
  MEDIUM: 'Середній',
  HIGH: 'Високий',
};

/** Ukrainian display labels for lifecycle statuses. */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Чернетка',
  PENDING: 'На розгляді',
  APPROVED: 'Затверджено',
  IMPLEMENTED: 'Впроваджено',
  REJECTED: 'Відхилено',
};

/** Tailwind CSS badge colors keyed by lifecycle status. */
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  IMPLEMENTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

/** Tailwind CSS badge colors keyed by risk tier. */
const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-800',
  HIGH: 'bg-red-100 text-red-800',
};

/** Button action labels for state transitions. */
const ACTION_LABELS: Record<string, string> = {
  PENDING: 'На розгляд',
  APPROVED: 'Затвердити',
  REJECTED: 'Відхилити',
  IMPLEMENTED: 'Впровадити',
};

/**
 * Change management dashboard component.
 *
 * @returns React functional component element.
 */
export const ChangeBoard = () => {
  const { role: userRole } = useUser();
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('NORMAL');
  const [risk, setRisk] = useState('MEDIUM');
  const [scheduledAt, setScheduledAt] = useState('');
  const [requestedBy, setRequestedBy] = useState('');

  /**
   * Fetches the current list of change requests from the backend API.
   */
  const fetchChanges = async (): Promise<void> => {
    try {
      const httpResponse = await fetch(API_BASE_URL);
      const responseData = await httpResponse.json();
      setChangeRequests(Array.isArray(responseData) ? responseData : []);
    } catch {
      setChangeRequests([]);
    }
  };

  useEffect(() => {
    fetchChanges();
  }, []);

  /**
   * Handles submission of a new change proposal form.
   *
   * @param formEvent - Form submission event.
   */
  const handleCreateChange = async (
    formEvent: FormEvent,
  ): Promise<void> => {
    formEvent.preventDefault();
    await fetch(API_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userRole,
      },
      body: JSON.stringify({
        title,
        description,
        type,
        risk,
        scheduledAt,
        requestedBy,
      }),
    });
    setTitle('');
    setDescription('');
    setScheduledAt('');
    setRequestedBy('');
    fetchChanges();
  };

  /**
   * Triggers a status transition for a specific change request.
   *
   * @param changeId - Target change request identifier.
   * @param targetStatus - Next status in CHANGE_WORKFLOW.
   */
  const handleStatusTransition = async (
    changeId: string,
    targetStatus: string,
  ): Promise<void> => {
    await fetch(`${API_BASE_URL}/${changeId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': userRole,
      },
      body: JSON.stringify({
        status: targetStatus,
        approvedBy: targetStatus === 'APPROVED' ? 'Admin' : undefined,
      }),
    });
    fetchChanges();
  };

  return (
    <div>
      {userRole === 'ADMIN' && (
        <form
          onSubmit={handleCreateChange}
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
              onChange={(inputEvent) => setTitle(inputEvent.target.value)}
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
                onChange={(selectEvent) => setType(selectEvent.target.value)}
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
                onChange={(selectEvent) => setRisk(selectEvent.target.value)}
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
                onChange={(dateEvent) => setScheduledAt(dateEvent.target.value)}
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
              onChange={(inputEvent) => setRequestedBy(inputEvent.target.value)}
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
              onChange={(textareaEvent) =>
                setDescription(textareaEvent.target.value)
              }
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
              {userRole === 'ADMIN' && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Дії
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {changeRequests.map((changeRequest) => (
              <tr key={changeRequest.id}>
                <td className="px-6 py-4 text-sm text-gray-900">
                  <div className="font-medium">{changeRequest.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                    {changeRequest.description}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                    {TYPE_LABELS[changeRequest.type] || changeRequest.type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      RISK_COLORS[changeRequest.risk] ||
                      'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {RISK_LABELS[changeRequest.risk] || changeRequest.risk}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      STATUS_COLORS[changeRequest.status] ||
                      'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {STATUS_LABELS[changeRequest.status] || changeRequest.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(changeRequest.scheduledAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {changeRequest.requestedBy}
                </td>
                {userRole === 'ADMIN' && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      {CHANGE_WORKFLOW[changeRequest.status]?.map(
                        (nextStatus) => (
                          <button
                            key={nextStatus}
                            onClick={() =>
                              handleStatusTransition(
                                changeRequest.id,
                                nextStatus,
                              )
                            }
                            className={`px-2 py-1 text-xs font-medium rounded ${
                              nextStatus === 'APPROVED'
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : nextStatus === 'REJECTED'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : nextStatus === 'IMPLEMENTED'
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                            }`}
                          >
                            {ACTION_LABELS[nextStatus] || nextStatus}
                          </button>
                        ),
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {changeRequests.length === 0 && (
              <tr>
                <td
                  colSpan={userRole === 'ADMIN' ? 7 : 6}
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
