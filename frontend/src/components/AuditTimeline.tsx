import { useEffect, useState } from 'react';

interface AuditLog {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

const API = '/api/applications';

const FIELD_LABELS: Record<string, string> = {
  STATUS: 'статус',
  PRIORITY: 'пріоритет',
  ASSIGNEE: 'виконавець',
};

export const AuditTimeline = ({ appId }: { appId: string }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    fetch(`${API}/${appId}/logs`)
      .then((res) => res.json())
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]));
  }, [appId]);

  if (logs.length === 0) {
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
        {logs.map((log, index) => {
          const isLatest = index === 0;
          return (
            <div key={log.id} className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <div
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isLatest ? 'bg-[#E8663B] ring-2 ring-[#FDEDE5]' : 'bg-[#DED4CA]'
                  }`}
                />
                {index !== logs.length - 1 && (
                  <div className="w-px flex-1 bg-[#EDE5DD] min-h-[36px]" />
                )}
              </div>
              <div className="flex flex-col gap-1 pb-4 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-[#1E1712]">
                    {FIELD_LABELS[log.field] || log.field}:{' '}
                    <span className="font-mono text-[#8B7D72]">{log.oldValue ?? '—'}</span>{' '}
                    <span className="text-[#8B7D72]">➔</span>{' '}
                    <span className="font-mono font-bold text-[#E8663B]">{log.newValue ?? '—'}</span>
                  </span>
                  <span className="text-[11px] font-mono text-[#8B7D72] whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })},{' '}
                    {new Date(log.createdAt).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
                <div className="text-[11px] text-[#8B7D72]">
                  Автор зміни: <span className="font-medium text-[#5A4E45]">{log.changedBy}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
