import { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  problemId?: string;
  problem?: { id: string; title: string; status: string } | null;
  createdAt: string;
  updatedAt: string;
}

const API = '/api/kb';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Чернетка',
  PUBLISHED: 'Опубліковано',
  ARCHIVED: 'Архівовано',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PUBLISHED: 'bg-green-100 text-green-800',
  ARCHIVED: 'bg-yellow-100 text-yellow-800',
};

const CATEGORIES = ['General', 'VPN', 'Hardware', 'Email', 'Software', 'Network', 'Access'];

export const KnowledgeBoard = () => {
  const { role } = useUser();
  const [articles, setArticles] = useState<Article[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchArticles = async () => {
    try {
      const url = statusFilter ? `${API}?status=${statusFilter}` : API;
      const res = await fetch(url);
      const data = await res.json();
      setArticles(Array.isArray(data) ? data : []);
    } catch {
      setArticles([]);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [statusFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editId ? 'PATCH' : 'POST';
    const url = editId ? `${API}/${editId}` : API;

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-user-role': role },
      body: JSON.stringify({ title, content, category }),
    });
    resetForm();
    fetchArticles();
  };

  const handleStatusChange = async (id: string, status: string) => {
    await fetch(`${API}/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-role': role },
      body: JSON.stringify({ status }),
    });
    fetchArticles();
  };

  const startEdit = (a: Article) => {
    setEditId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setCategory(a.category);
    setShowForm(true);
  };

  const resetForm = () => {
    setEditId(null);
    setTitle('');
    setContent('');
    setCategory('General');
    setShowForm(false);
  };

  const renderContent = (md: string) => {
    return md
      .replace(/### (.+)/g, '<h3 class="text-lg font-semibold mt-3 mb-1">$1</h3>')
      .replace(/## (.+)/g, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div>
      {role === 'ADMIN' && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            {showForm ? '✕ Закрити' : '+ Нова стаття'}
          </button>
          {['', 'DRAFT', 'PUBLISHED', 'ARCHIVED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s ? STATUS_LABELS[s] : 'Всі'}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-lg shadow p-6 mb-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-800">
            {editId ? 'Редагувати статтю' : 'Нова стаття'}
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Назва
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Категорія
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Контент (Markdown)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder="## Опис проблеми&#10;&#10;### Причина&#10;&#10;### Рішення&#10;1. Крок перший&#10;2. Крок другий"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none font-mono text-sm"
              required
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {editId ? 'Зберегти' : 'Створити'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              Скасувати
            </button>
          </div>
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
                Категорія
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Оновлено
              </th>
              {role === 'ADMIN' && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Дії
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {articles.map((a) => (
              <tr
                key={a.id}
                onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {a.title}
                  </div>
                  {a.problem && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Пов'язана проблема: {a.problem.title}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                    {a.category}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      STATUS_COLORS[a.status]
                    }`}
                  >
                    {STATUS_LABELS[a.status]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(a.updatedAt).toLocaleDateString('uk-UA')}
                </td>
                {role === 'ADMIN' && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(a);
                        }}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        ✏️
                      </button>
                      {a.status === 'DRAFT' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(a.id, 'PUBLISHED');
                          }}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          Опублікувати
                        </button>
                      )}
                      {a.status === 'PUBLISHED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(a.id, 'ARCHIVED');
                          }}
                          className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                        >
                          Архівувати
                        </button>
                      )}
                      {a.status === 'ARCHIVED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(a.id, 'PUBLISHED');
                          }}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          Відновити
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {articles.length === 0 && (
              <tr>
                <td
                  colSpan={role === 'ADMIN' ? 5 : 4}
                  className="px-6 py-8 text-center text-sm text-gray-500"
                >
                  Статей не знайдено.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {expandedId && (
        <div className="mt-4 bg-white rounded-lg shadow p-6">
          {(() => {
            const a = articles.find((x) => x.id === expandedId);
            if (!a) return null;
            return (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderContent(a.content) }}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
};
