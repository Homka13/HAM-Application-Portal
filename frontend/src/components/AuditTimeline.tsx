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
      .then(setLogs);
  }, [appId]);

  if (logs.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-gray-400">
        Змін ще не було
      </div>
    );
  }

  return (
    <div className="flow-root py-2">
      <ul className="-mb-8">
        {logs.map((log, index) => (
          <li key={log.id}>
            <div className="relative pb-6">
              {index !== logs.length - 1 && (
                <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" />
              )}

              <div className="relative flex space-x-3">
                <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white">
                  <span className="text-white text-[10px] font-bold">LOG</span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  <div>
                    <p className="text-sm text-gray-500">
                      <span className="font-medium text-gray-900">{log.changedBy}</span>
                      {' змінив '}
                      <span className="font-bold text-gray-700">
                        {FIELD_LABELS[log.field] || log.field}
                      </span>
                    </p>
                    <p className="text-sm text-gray-400">
                      {log.oldValue ?? '—'}{' '}
                      <span className="text-gray-500">→</span>{' '}
                      <span className="text-green-600 font-medium">
                        {log.newValue ?? '—'}
                      </span>
                    </p>
                  </div>
                  <div className="whitespace-nowrap text-right text-sm text-gray-400">
                    <time dateTime={log.createdAt}>
                      {new Date(log.createdAt).toLocaleString()}
                    </time>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
