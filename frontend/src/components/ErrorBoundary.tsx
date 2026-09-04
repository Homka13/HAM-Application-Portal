/**
 * @file frontend/src/components/ErrorBoundary.tsx
 * @module components/ErrorBoundary
 * @description React class Error Boundary intercepting unhandled rendering exceptions.
 *
 * Architectural Role:
 * Wraps the top-level application component tree to prevent catastrophic white-screen
 * crashes in production. When a child component throws an unhandled exception during
 * rendering, layout, or lifecycle execution, this component catches the error,
 * logs diagnostics to the console, and presents a user-friendly error card
 * with a one-click page reload recovery action.
 *
 * Inputs:
 * - `Props.children`: React component subtree to guard.
 *
 * Outputs:
 * - Renders child components normally, or diagnostic recovery UI upon failure.
 *
 * Constraints & Assumptions:
 * - Error boundaries catch errors in rendering, lifecycle methods, and constructors
 *   of the tree below them; they do not catch errors in event handlers or async timers.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Props contract for ErrorBoundary component.
 */
interface Props {
  /** Child component subtree wrapped by the boundary. */
  children: ReactNode;
}

/**
 * Internal state tracking whether an error has been caught.
 */
interface State {
  /** Flag indicating whether an active rendering error was intercepted. */
  hasError: boolean;
  /** The intercepted Error instance, or null if healthy. */
  error: Error | null;
}

/**
 * React Error Boundary class component.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  /**
   * Derives state from thrown error, switching boundary into fallback render mode.
   *
   * @param error - The caught runtime exception.
   * @returns Updated state object with `hasError: true`.
   */
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Intercepts component stack traces for diagnostic logging.
   *
   * @param error - The runtime exception thrown by a child component.
   * @param errorInfo - React component tree hierarchy where the error originated.
   */
  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught render error:', error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full border border-red-100">
            <div className="flex items-center space-x-3 text-red-600 mb-4">
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h2 className="text-xl font-bold">Щось пішло не так</h2>
            </div>
            <p className="text-gray-600 mb-6 text-sm">
              Виникла помилка під час рендерингу інтерфейсу. Можливо, сервер бази
              даних недоступний або сталася неочікувана помилка в браузері.
            </p>
            <div className="bg-gray-100 p-3 rounded text-xs font-mono text-gray-700 mb-6 overflow-auto max-h-32">
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition"
            >
              Перезавантажити сторінку
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
