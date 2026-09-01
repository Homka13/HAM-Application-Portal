# MEMORY.md — Project Knowledge Base & Deployment History

## Project Overview

**HAM Application Portal** is an ITIL/ITSM-compliant management portal built with:
- **Backend**: Node.js, Express 5, TypeScript, Prisma 8 ORM for PostgreSQL.
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, custom D3.js visualization charts.
- **Monitoring & Metrics**: Prometheus client (`/metrics`) + Grafana dashboards.
- **Deployment Platform**: Prisma Cloud Compute (`eu-central-1`) + Render Web Service (Docker).

---

## Key Commands

- `npm run dev` — Run development server with auto-reloading (`tsx watch src/index.ts`)
- `npm run build` — Build full stack: Prisma contract emit + Vite frontend build + standalone backend esbuild bundle + asset copy
- `npm test` — Run full build + local automated smoke tests (`test/smoke.test.js`)
- `npm run contract:emit` — Emit Prisma 8 contract JSON and TypeScript declarations
- `npm run db:update` — Synchronize database schema locally
- `npm run db:migrate` — Apply planned database migrations
- `npm run seed` — Seed initial database records (`prisma/seed.ts`)

---

## Solved Issues & Deployment Roadmap

### 1. Build Failure in Cloud CI (`npm run build exited with status 2`)
- **Problem**: `contract.json` and `contract.d.ts` were in `.gitignore`. When CI cloned the repository, static imports in `module.mjs` failed before compilation could run.
- **Solution**: Removed contract files from `.gitignore`, emitted schema contracts, and committed `src/prisma/contract.json` and `src/prisma/contract.d.ts` directly into version control.

### 2. Frontend Missing Dependencies on CI (`npm ci exited with status 1`)
- **Problem**: Subdirectory `frontend/` had separate dependencies that were not installed when CI ran `npm ci` at the root. TypeScript compiler failed finding `React`, `d3`, `@vitejs/plugin-react`.
- **Solution**: Configured `"workspaces": ["frontend"]` in root `package.json` and synchronized `package-lock.json` so `npm ci` installs all workspace packages in a single pass.

### 3. OpenResty 502 Bad Gateway — Missing Node Modules in Cloud Containers
- **Problem**: Prisma Compute does not preserve `node_modules` inside deployment containers. Using `esbuild --packages=external` left imports unbundled, causing Node to crash on boot (`Cannot find package 'express'`).
- **Solution**: Updated `esbuild` to bundle all dependencies into a standalone `dist/index.js` (3.3 MB) and added `--banner:js="import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);"` for CommonJS compatibility.

### 4. OpenResty 502 Bad Gateway — Express 5 Route Parsing Error
- **Problem**: Express 5 uses `path-to-regexp` v8 which throws `PathError: Missing parameter name` when registering `app.get('*')`, causing an immediate uncaught exception on startup.
- **Solution**: Replaced `app.get('*')` with `app.use((req, res, next) => ...)` to safely handle SPA fallback routing.

### 5. Dynamic Cloud Port & Database URL Binding
- **Problem**: Prisma Compute assigns dynamic container ports and database connection strings at runtime (`COMPOSER_*_PORT`, `COMPOSER_*_DB_URL`).
- **Solution**: Added multi-layer fallbacks in `src/index.ts` (dual-stack listening on `process.env.PORT || 3000`) and `src/config/db.ts` (using `service.load()` and environment variables).

### 6. Database Migration Requirement for Prisma Cloud
- **Problem**: Deploy pipeline failed with `MIGRATION_PATH_NOT_FOUND` because cloud deployment requires authored migration files to provision a clean database.
- **Solution**: Executed `prisma migration plan --name init` and committed baseline migrations under `migrations/app/20260831T1258_baseline/`.

### 7. Local Testing Suite to Prevent Deploy Spam
- **Problem**: Deploying each small fix to GitHub Actions took time and created unnecessary commits.
- **Solution**: Created `test/smoke.test.js` and added `npm test`. In 3 seconds, it validates the build, launches the bundled server in a background process, tests `/api/health`, `/`, `/metrics`, and SPA fallback, and shuts down cleanly.

### 8. Lockfile Version Mismatch on CI (`bun.lock` vs `package-lock.json`)
- **Problem**: `bun.lock` generated locally in WSL under Bun 1.4.0 caused `UnknownLockfileVersion` on GitHub Actions running Bun 1.3.13.
- **Solution**: Removed `bun.lock` from git tracking and ignored it in `.gitignore` so CI uses `npm ci` with `package-lock.json`.

### 9. Frontend White Screen Crash Prevention & ErrorBoundary
- **Problem**: When the database was offline or returned an error object, frontend components calling `.filter()` or `.map()` threw runtime TypeErrors, causing a blank white screen.
- **Solution**: Added `frontend/src/components/ErrorBoundary.tsx` wrapping the application, and guarded all state setters with `Array.isArray(data) ? data : []`.

### 10. Resilient Data Layer (`src/lib/storage.ts`) & Flexible Zod Validation
- **Problem**: Running without a local PostgreSQL daemon caused 500 errors on ticket creation, and strict `uuid` validation in Zod schemas rejected standard service catalog IDs (e.g. `srv-1`). Also, the admin/user toggle was redundant for regular workflow.
- **Solution**:
  - Removed admin/user switcher from the header (defaulting to standard user).
  - Created `src/lib/storage.ts` providing seamless local JSON persistence with pre-seeded services and KB articles when PostgreSQL is offline, while automatically routing to Prisma Postgres in production.
  - Relaxed Zod validation to accept string IDs (`srv-*` and UUIDs).

### 11. Docker & Render Deployment Build Fix (`ENOENT /app/frontend/package.json`)
- **Problem**: When building the Docker image on Render, `npm run build` failed with `ENOENT: no such file or directory, open '/app/frontend/package.json'`.
- **Solution**:
  - Cleaned `.dockerignore` to remove `frontend` and `src/prisma/contract.*` so the build context includes the entire monorepo.
  - Updated `Dockerfile` to copy `package*.json` and `frontend/package*.json` before `npm install`, and set `CMD ["node", "dist/index.js"]` for fast standalone startup.

### 12. Render Deployment Setup & Verification
- **Configuration on Render**:
  - Service Type: **Web Service** (Docker).
  - Repository: `Homka13/HAM-Application-Portal`, branch `main`.
  - Dockerfile path: `./Dockerfile`.
  - Health check path: `/api/health`.
  - Port binding: Express automatically reads `process.env.PORT` (Render uses `10000`) and serves both API and SPA static bundle from `dist/public`.
