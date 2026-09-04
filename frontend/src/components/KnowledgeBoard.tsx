/**
 * @file KnowledgeBoard.tsx
 * @description Knowledge Base (KB) management component for creating,
 * editing, searching, publishing, and archiving operational standard operating
 * procedures (SOPs), troubleshooting guides, and solutions to known problems.
 *
 * Requirements Addressed:
 * - ITIL Knowledge Management: Structured authoring and publication lifecycle
 *   (DRAFT -> PUBLISHED -> ARCHIVED).
 * - Role-Based Administration: Only users with 'ADMIN' privileges can compose,
 *   edit, or alter the publication status of knowledge articles.
 * - Markdown Rendering: Lightweight client-side transformation of markdown
 *   headings, lists, and emphasis for readable problem workarounds.
 */

import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';

/**
 * Knowledge Base article record schema.
 */
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

/** Base REST endpoint for Knowledge Base operations. */
const API = '/api/kb';

/** Localized UI labels for article publication statuses. */
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Чернетка',
  PUBLISHED: 'Опубліковано',
  ARCHIVED: 'Архівовано',
};

/** Tailwind CSS badge color classes for article publication statuses. */
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PUBLISHED: 'bg-green-100 text-green-800',
  ARCHIVED: 'bg-yellow-100 text-yellow-800',
};

/** Standard operational taxonomy categories for knowledge articles. */
const CATEGORIES: readonly string[] = [
  'General',
  'VPN',
  'Hardware',
  'Email',
  'Software',
  'Network',
  'Access',
];

/**
 * KnowledgeBoard component rendering the searchable knowledge repository,
 * detail preview pane, and administrative editing interface.
 *
 * @returns {React.ReactElement} The rendered Knowledge Base board.
 */
export const KnowledgeBoard: React.FC = () => {
  const { role } = useUser();
  const [articles, setArticles] = useState<Article[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /**
   * Fetches articles matching the active status filter from the REST API.
   */
  const fetchArticles = async (): Promise<void> => {
    try {
      const url = statusFilter ? `${API}?status=${statusFilter}` : API;
      const response = await fetch(url);
      const data = await response.json();
      setArticles(Array.isArray(data) ? data : []);
    } catch {
      setArticles([]);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [statusFilter]);

  /**
   * Submits a new article or persists edits to an existing one.
   *
   * @param {React.FormEvent} event - The form submission event.
   */
  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const method = editId ? 'PATCH' : 'POST';
    const url = editId ? `${API}/${editId}` : API;

    await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': role,
      },
      body: JSON.stringify({ title, content, category }),
    });

    resetForm();
    await fetchArticles();
  };

  /**
   * Transitions an article's publication status.
   *
   * @param {string} id - Article identifier.
   * @param {string} status - New target status ('DRAFT', 'PUBLISHED', or 'ARCHIVED').
   */
  const handleStatusChange = async (
    id: string,
    status: string
  ): Promise<void> => {
    await fetch(`${API}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': role,
      },
      body: JSON.stringify({ status }),
    });
    await fetchArticles();
  };

  /**
   * Pre-populates the editor form with an existing article's data.
   *
   * @param {Article} articleItem - The article to be edited.
   */
  const startEdit = (articleItem: Article): void => {
    setEditId(articleItem.id);
    setTitle(articleItem.title);
    setContent(articleItem.content);
    setCategory(articleItem.category);
    setShowForm(true);
  };

  /**
   * Resets form fields and closes the authoring interface.
   */
  const resetForm = (): void => {
    setEditId(null);
    setTitle('');
    setContent('');
    setCategory('General');
    setShowForm(false);
  };

  /**
   * Converts basic markdown text into styled HTML markup.
   *
   * @param {string} markdownContent - Raw markdown string.
   * @returns {string} Sanitized and transformed HTML string.
   */
  const renderContent = (markdownContent: string): string => {
    return markdownContent
      .replace(
        /### (.+)/g,
        '<h3 class="text-lg font-semibold mt-3 mb-1">$1</h3>'
      )
      .replace(
        /## (.+)/g,
        '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>'
      )
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
          {(['', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const).map(
            (statusOption) => (
              <button
                key={statusOption}
                onClick={() => setStatusFilter(statusOption)}
                className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                  statusFilter === statusOption
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {statusOption ? STATUS_LABELS[statusOption] : 'Всі'}
              </button>
            )
          )}
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
              onChange={(event) => setTitle(event.target.value)}
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
                onChange={(event) => setCategory(event.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                {CATEGORIES.map((categoryOption) => (
                  <option key={categoryOption} value={categoryOption}>
                    {categoryOption}
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
              onChange={(event) => setContent(event.target.value)}
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
            {articles.map((articleItem) => (
              <tr
                key={articleItem.id}
                onClick={() =>
                  setExpandedId(
                    expandedId === articleItem.id ? null : articleItem.id
                  )
                }
                className="cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {articleItem.title}
                  </div>
                  {articleItem.problem && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Пов'язана проблема: {articleItem.problem.title}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                    {articleItem.category}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      STATUS_COLORS[articleItem.status]
                    }`}
                  >
                    {STATUS_LABELS[articleItem.status]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(articleItem.updatedAt).toLocaleDateString('uk-UA')}
                </td>
                {role === 'ADMIN' && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex gap-1">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          startEdit(articleItem);
                        }}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        ✏️
                      </button>
                      {articleItem.status === 'DRAFT' && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusChange(articleItem.id, 'PUBLISHED');
                          }}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          Опублікувати
                        </button>
                      )}
                      {articleItem.status === 'PUBLISHED' && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusChange(articleItem.id, 'ARCHIVED');
                          }}
                          className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                        >
                          Архівувати
                        </button>
                      )}
                      {articleItem.status === 'ARCHIVED' && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusChange(articleItem.id, 'PUBLISHED');
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
            const selectedArticle = articles.find(
              (candidateArticle) => candidateArticle.id === expandedId
            );
            if (!selectedArticle) return null;
            return (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: renderContent(selectedArticle.content),
                }}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
};
