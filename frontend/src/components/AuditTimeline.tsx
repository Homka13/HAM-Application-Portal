/**
 * @file frontend/src/components/AuditTimeline.tsx
 * @module components/AuditTimeline
 * @description Vertical timeline visualizer displaying historical audit trail logs.
 *
 * Architectural Role:
 * Renders chronological audit records fetched from `GET /api/applications/:appId/logs`.
 * Visualizes status changes, priority shifts, and assignee mutations with visual
 * connectors, user attributions, and localized Ukrainian date/time formatting.
 *
 * Inputs:
 * - `appId`: UUID of the application whose audit history is being inspected.
 *
 * Outputs:
 * - Interactive vertical audit trail drawer within the ticket detail view.
 *
 * Constraints & Assumptions:
 * - Expects logs returned from the backend in reverse chronological order (newest first).
 */

import { useEffect, useState } from 'react';

/**
 * Audit log entry structure received from the backend API.
 */
interface AuditLog {
  /** Unique audit entry identifier. */
  id: string;
  /** Field modified during the logged event. */
  field: string;
  /** Value prior to modification. */
  oldValue: string | null;
  /** Value resulting from modification. */
  newValue: string | null;
  /** User or system process responsible for the modification. */
  changedBy: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/** API base endpoint for application resource lookups. */
const API_BASE_URL = '/api/applications';

/** Localized Ukrainian labels for tracked audit fields. */
const FIELD_LABELS: Record<string, string> = {
  STATUS: 'статус',
  PRIORITY: 'пріоритет',
  ASSIGNEE: 'виконавець',
};

/**
 * Props contract for the AuditTimeline component.
 */
interface AuditTimelineProps {
  /** The application ticket identifier. */
  appId: string;
}

/**
 * Renders a vertical timeline representing the historical audit trail for a ticket.
 *
 * @param props - Component props containing `appId`.
 * @returns React functional component element.
 */
export const AuditTimeline = ({ appId }: AuditTimelineProps) => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/${appId}/logs`)
      .then((httpResponse) => httpResponse.json())
      .then((responseData) =>
        setAuditLogs(Array.isArray(responseData) ? responseData : []),
      )
      .catch(() => setAuditLogs([]));
  }, [appId]);

  if (auditLogs.length === 0) {
    return (
      <div className="py-4 text-center text-xs font-mono text-[#8B7D72]">
        Змін ще не зафіксовано в аудит-журналі
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="text-xs font-semibold text-[#5A4E45] mb-3 uppercase tracking-wider font-mono">
        Аудит-журнал переміщень
      </div>
      <div className="flex flex-col gap-0">
        {auditLogs.map((logEntry, logIndex) => {
          const isLatestEntry = logIndex === 0;
          return (
            <div key={logEntry.id} className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isLatestEntry
                      ? 'bg-[#E8663B] ring-2 ring-[#FDEDE5]'
                      : 'bg-[#DED4CA]'
                  }`}
                />
                {logIndex !== auditLogs.length - 1 && (
                  <div className="w-px flex-1 bg-[#EDE5DD] min-h-[36px]" />
                )}
              </div>
              <div className="flex flex-col gap-1 pb-4 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-[#1E1712]">
                    {FIELD_LABELS[logEntry.field] || logEntry.field}:{' '}
                    <span className="font-mono text-[#8B7D72]">
                      {logEntry.oldValue ?? '—'}
                    </span>{' '}
                    <span className="text-[#8B7D72]">➔</span>{' '}
                    <span className="font-mono font-bold text-[#E8663B]">
                      {logEntry.newValue ?? '—'}
                    </span>
                  </span>
                  <span className="text-[11px] font-mono text-[#8B7D72] whitespace-nowrap">
                    {new Date(logEntry.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    ,{' '}
                    {new Date(logEntry.createdAt).toLocaleDateString([], {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                </div>
                <div className="text-[11px] text-[#8B7D72]">
                  Автор зміни:{' '}
                  <span className="font-medium text-[#5A4E45]">
                    {logEntry.changedBy}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
