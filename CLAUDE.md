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
  - Controllers in `src/controllers/*` communicate with database via `src/config/db.ts`.
  - Serves compiled React frontend from `dist/public` with an Express 5 compatible SPA fallback.
  - Binds to `0.0.0.0` with dynamic port (`PORT` / `COMPOSER_*_PORT`) and dynamic database connection (`DATABASE_URL` / `COMPOSER_*_DB_URL`).
  - Domain models: `Application` (service requests & incidents), `ServiceCatalog`, `ChangeRequest`, `Problem`, `KnowledgeArticle`, and `AuditLog`.
  - Background SLA escalation (`src/cronJobs.ts`) runs every 15 minutes to escalate approaching deadlines to CRITICAL priority with audit logging.
  - Prometheus metrics exposed at `/metrics` (`http_requests_total`, `http_request_duration_ms`, `itsm_tickets_by_status`).
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS (SPA).
  - Feature boards: `Dashboard` (custom D3 charts), `ChangeBoard`, `ProblemBoard`, `KnowledgeBoard`, `AuditTimeline`.
  - All API calls use relative `/api/...` endpoints.
  - UI language is Ukrainian.

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
   - Must listen on `0.0.0.0` (not `127.0.0.1`) so OpenResty reverse proxy can route traffic.
   - Dynamic port selection: `process.env.PORT || process.env.COMPOSER_HAMAPPLICATIONPORTAL_PORT || 3000`.
6. **Database Migration Requirement in Cloud**:
   - Prisma deploy pipelines do not automatically generate schemas on the fly; authored migrations in `migrations/app/` are required.
