import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface Stats {
  mttrMinutes: number;
  slaRate: number;
  incidentVolume: { name: string; count: number }[];
  problemRatio: number;
  totalIncidents: number;
  totalProblems: number;
  byStatus: Record<string, number>;
}

const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899'];
const STATUS_COLORS: Record<string, string> = {
  NEW: '#9ca3af',
  IN_PROGRESS: '#3b82f6',
  RESOLVED: '#10b981',
  CLOSED: '#6b7280',
};

export const Dashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('http://localhost:3000/api/reports/stats')
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Завантаження...</div>
      </div>
    );
  }

  const formatMttr = (min: number) => {
    if (min < 60) return `${min} хв`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h} год ${m} хв` : `${h} год`;
  };

  const statusData = Object.entries(stats.byStatus).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm text-gray-500 mb-1">MTTR (середній час ремонту)</div>
          <div className="text-2xl font-bold text-blue-600">
            {formatMttr(stats.mttrMinutes)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm text-gray-500 mb-1">SLA Compliance</div>
          <div className="text-2xl font-bold text-green-600">{stats.slaRate}%</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm text-gray-500 mb-1">Всього інцидентів</div>
          <div className="text-2xl font-bold text-gray-800">{stats.totalIncidents}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm text-gray-500 mb-1">Problem/Incident Ratio</div>
          <div className="text-2xl font-bold text-purple-600">{stats.problemRatio}%</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Incident Volume by Service */}
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Інциденти за сервісами
          </h3>
          {stats.incidentVolume.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.incidentVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Кількість" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-gray-400 text-sm py-8 text-center">Немає даних</div>
          )}
        </div>

        {/* Status Distribution */}
        <div className="bg-white rounded-lg shadow p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Розподіл за статусами
          </h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {statusData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={STATUS_COLORS[statusData[idx].name] || COLORS[idx % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-gray-400 text-sm py-8 text-center">Немає даних</div>
          )}
        </div>
      </div>
    </div>
  );
};
