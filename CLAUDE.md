# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Core Commands (Repo Root)
- `npm run dev` — Run the API in development mode with `tsx watch` (`src/index.ts`, port 3000 by default)
- `npm run build` — Full production build: emits Prisma contract, builds frontend with Vite, bundles self-contained backend with esbuild into `dist/index.js`, and copies frontend to `dist/public`
- `npm test` — Run full build + local automated smoke tests (`test/smoke.test.js`) verifying build artifacts, server boot, API health, SPA delivery, and metrics
- `npm run test:smoke` — Run smoke tests against existing `dist/` without rebuilding
- `npm start` — Run compiled server bundle (`src/index.ts` via `tsx`)
- `npm run contract:emit` — Compile Prisma 8 schema to `src/prisma/contract.json` and `src/prisma/contract.d.ts`
- `npm run db:update` — Synchronize database schema directly (local iteration)
- `npm run db:migrate` — Apply planned Prisma migrations
- `npm run seed` — Seed initial database records (`prisma/seed.ts`)

### Frontend (`frontend/`)
- `npm run dev` — Vite dev server with `/api` proxy targeting port 3000
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — `oxlint`
- `npm run preview` — Preview the production build

### Docker & Infrastructure
- `docker-compose up -d` — Runs full stack: PostgreSQL 16, backend API (port 3000), frontend (port 80), Prometheus (port 9090), Grafana (port 3001), and automated backup service.

---

## Architecture

This is an ITIL/ITSM-style application portal:
- **Monorepo / Workspaces**: Root `package.json` configures `"workspaces": ["frontend"]` so `npm install` and `npm ci` resolve all backend and frontend dependencies in a single step.
- **Backend**: Express 5 + TypeScript + Prisma 8 ORM for PostgreSQL.
  - Storage Layer: Hybrid resilient storage via `src/lib/storage.ts` — automatically queries Prisma Postgres in production and falls back to persistent local storage (`data/local-db.json`) in local development when PostgreSQL is not running.
  - Serves compiled React frontend from `dist/public` with an Express 5 compatible SPA fallback.
  - Binds dynamically to `process.env.PORT || 3000` on dual-stack host (`0.0.0.0`).
  - Domain models: `Application` (service requests & incidents), `ServiceCatalog`, `ChangeRequest`, `Problem`, `KnowledgeArticle`, and `AuditLog`.
  - Background SLA escalation (`src/cronJobs.ts`) runs every 15 minutes to escalate approaching deadlines to CRITICAL priority with audit logging.
  - Prometheus metrics exposed at `/metrics` (`http_requests_total`, `http_request_duration_ms`, `itsm_tickets_by_status`).
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS (SPA) wrapped in `ErrorBoundary`.
  - Feature boards: `Dashboard` (custom D3 charts), `ChangeBoard`, `ProblemBoard`, `KnowledgeBoard`, `AuditTimeline`.
  - All API calls use relative `/api/...` endpoints with array guards.
  - UI language is Ukrainian.

---

## Render Deployment Guide (Step-by-Step)

To deploy the application on **Render (render.com)**:
1. **Service Type**: Create a **Web Service** (NOT a Static Site).
2. **Repository**: Connect `https://github.com/Homka13/HAM-Application-Portal.git` (Branch: `main`).
3. **Environment / Runtime**: Select **Docker**.
   - Dockerfile path: `./Dockerfile` (or root default).
4. **Environment Variables** (Optional):
   - `DATABASE_URL` — PostgreSQL connection string (if using external Managed Postgres; if omitted, the resilient `storage.ts` in-memory/file fallback takes over seamlessly).
   - `PORT` — Set by Render automatically (`10000`). The server binds dynamically to `process.env.PORT`.
5. **Health Check Path**: `/api/health`.
6. **Deploy**: Trigger deployment. The container will install dependencies, emit contracts, compile Vite frontend and backend bundle, and start with `CMD ["node", "dist/index.js"]`.

---

## Prisma Cloud / Prisma Compute Deployment Guide

The repository is configured for automated continuous deployment via **GitHub Actions** (`.github/workflows/prisma-deploy.yml`) to **Prisma Cloud Compute & Prisma Postgres**:
- `module.mjs` — Root application module defining the Postgres database and compute service.
- `service.mjs` — Compute service definition pointing to `dist/index.js`.
- `prisma-composer.config.mjs` — Region and cloud deployment configuration (`eu-central-1`).
- `migrations/app/` — Version-controlled baseline database migrations.

---

## Resolved Deployment Issues & Gotchas

1. **Prisma Contract Files in Version Control**:
   - `src/prisma/contract.json` and `src/prisma/contract.d.ts` must NOT be in `.gitignore`. They are imported statically in `module.mjs` and `service.mjs`.
2. **Monorepo Dependency Management on CI (`npm ci`)**:
   - Root `package.json` must include `"workspaces": ["frontend"]` so `npm ci` installs both backend and frontend dependencies without missing TypeScript or React types.
3. **Container-Ready Self-Contained Bundling**:
   - Cloud containers execute `dist/index.js` without copying `node_modules`.
   - `esbuild` must bundle all dependencies into `dist/index.js` (without `--packages=external`) with `--banner:js="import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);"` for CommonJS compatibility.
4. **Express 5 SPA Fallback Routing**:
   - Express 5 with `path-to-regexp` v8 rejects `app.get('*')` with `PathError`. Use `app.use((req, res, next) => ...)` for catch-all fallback routing.
5. **Dynamic Host & Port Binding**:
   - Dual-stack listening on `process.env.PORT || 3000` allows reverse proxy routing across IPv4/IPv6 interfaces.
6. **Database Migration Requirement in Cloud**:
   - Prisma deploy pipelines do not automatically generate schemas on the fly; authored migrations in `migrations/app/` are required.
7. **Lockfile Version Mismatch (`bun.lock` vs `package-lock.json`)**:
   - `bun.lock` generated in newer Bun versions fails older CI runners. Kept `bun.lock` in `.gitignore` and rely on standard `package-lock.json`.
8. **Frontend White Screen Prevention**:
   - Added `ErrorBoundary` and guarded all component state setters with `Array.isArray(data) ? data : []`.
9. **Zero-Config Local Storage & Zod String IDs**:
   - Added `src/lib/storage.ts` and updated Zod validation to allow custom string IDs (`srv-*`) alongside UUIDs.
10. **Docker Build Context on Render (`.dockerignore`)**:
    - Removed `frontend` and `src/prisma/contract.*` from `.dockerignore` so Docker builds have access to all client files and build steps succeed with `ENOENT` eliminated.
