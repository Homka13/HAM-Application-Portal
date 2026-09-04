/**
 * @file copy-frontend.js
 * @description Post-build staging utility script for the HAM Application Portal.
 *
 * Pipeline Role:
 * 1. Stages production frontend assets: Copies the compiled Single-Page
 *    Application (SPA) bundle from `frontend/dist/` into `dist/public/` so that
 *    the Express HTTP server can serve static assets directly in production.
 * 2. Mirrors the root entrypoint: Copies the compiled backend output
 *    `dist/index.js` to the root `index.js` to satisfy container execution
 *    environments expecting a top-level Node.js process entrypoint.
 *
 * Inputs:
 * - `frontend/dist/` (compiled Vite React build artifacts).
 * - `dist/index.js` (compiled TypeScript backend server bundle).
 *
 * Outputs:
 * - `dist/public/` populated with client HTML, CSS, and JS bundles.
 * - `index.js` copied to repository root for execution by `npm start`.
 */

import fs from 'fs';

/**
 * Stage frontend distribution assets into the backend public directory.
 */
if (fs.existsSync('frontend/dist')) {
  fs.mkdirSync('dist/public', { recursive: true });
  fs.cpSync('frontend/dist', 'dist/public', { recursive: true });
  console.log('Frontend built and copied to dist/public');
}

/**
 * Mirror the compiled backend entrypoint to the project root directory.
 */
if (fs.existsSync('dist/index.js')) {
  fs.copyFileSync('dist/index.js', 'index.js');
}
