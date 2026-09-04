/**
 * @file frontend/src/main.tsx
 * @module frontend/main
 * @description Single Page Application (SPA) DOM bootstrapper for the portal.
 *
 * Architectural Role:
 * Bootstraps the React 19 client application into the root DOM container (`#root`).
 * Composes the top-level provider hierarchy:
 * 1. `React.StrictMode`: Activates runtime double-invocation checks for component purity.
 * 2. `ErrorBoundary`: Catches unhandled React render exceptions and renders friendly UI.
 * 3. `UserProvider`: Injects application-wide user role and authentication state.
 * 4. `App`: Renders the primary application interface with navigation tabs and forms.
 *
 * Inputs:
 * - DOM element `<div id="root"></div>` from `index.html`.
 * - Global Tailwind stylesheet `./index.css`.
 *
 * Outputs:
 * - Mounts the interactive React component tree into the browser DOM.
 *
 * Constraints & Assumptions:
 * - Requires `#root` element to exist in the host HTML document.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { UserProvider } from './context/UserContext';
import { ErrorBoundary } from './components/ErrorBoundary';

// Locate the primary DOM mount target.
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Fatal: Root element #root was not found in the DOM.');
}

// Mount the React component tree with top-level error boundaries and contexts.
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <UserProvider>
        <App />
      </UserProvider>
    </ErrorBoundary>
  </StrictMode>,
);
