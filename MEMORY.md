# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (repo root):
- `npm run dev` — run the API with nodemon (`src/index.ts`, port 3000 by default)
- `npm run build` — compile TypeScript to `dist/` via `tsc`
- `npm start` — run the compiled server (`dist/index.js`)
- `npx prisma migrate dev` — apply/create a Prisma migration (SQLite db at `prisma/dev.db`)
- `npx prisma generate` — regenerate the Prisma client after schema changes
- `npx prisma db seed` — run `prisma/seed.ts` (configured via the `prisma.seed` field in package.json)
- No test suite exists yet (`npm test` is a placeholder that exits non-zero)

Frontend (`frontend/`):
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — `oxlint`
- `npm run preview` — preview the production build

Docker: `docker-compose.yml` at the root wires up `backend`, `frontend`, a `backup` service (rclone + Slack webhook), and a `prometheus`/`grafana` pair for metrics.

## Architecture

This is an ITSM/ITIL-style application portal: two independent npm projects (backend at root, frontend in `frontend/`) with no shared package or monorepo tooling — install and run each separately.

**Backend** — Express + TypeScript + Prisma (SQLite), entry point `src/index.ts`:
- Route → controller pattern with no service/repository layer; controllers in `src/controllers/*` talk to Prisma directly via `src/config/db.ts`.
- Domain models (`prisma/schema.prisma`): `Application` (the core ticket, with `type` SERVICE_REQUEST/INCIDENT and `status` NEW/IN_PROGRESS/RESOLVED/CLOSED) links optionally to `ServiceCatalog`, `ChangeRequest`, and `Problem`; every field change on an `Application` is expected to produce an `AuditLog` row (see `applicationController`). `Problem` can have one `KnowledgeArticle`.
- Auth is a stand-in, not real authentication: `authMiddleware.ts`'s `authorizeRole` just reads the `x-user-role` header (`USER`/`ADMIN`) — there's no session, token, or user table. The frontend's `UserContext` just toggles this header value client-side.
- `cronJobs.ts` runs an SLA auto-escalation job every 15 minutes: any non-closed, non-CRITICAL application within 30 minutes of `slaDeadline` gets bumped to CRITICAL priority, with a matching `AuditLog` entry written in the same transaction.
- Prometheus metrics are wired directly into `index.ts` (request counter/histogram middleware, a ticket-by-status gauge refreshed on scrape) and exposed at `/metrics`; app routes live under `/api/applications`, `/api/services`, `/api/changes`, `/api/problems`, `/api/kb`, `/api/reports`.

**Frontend** — React 19 + Vite + TypeScript + Tailwind, single-page (no router): `App.tsx` owns the applications list/board and switches between feature components (`Dashboard`, `ChangeBoard`, `ProblemBoard`, `KnowledgeBoard`, `AuditTimeline`) in `frontend/src/components/`. Dashboard charts are hand-built with D3 (not a chart library — Recharts was removed in favor of D3). The API base URL is hardcoded to `http://localhost:3000/api/...` in the component files rather than read from env config. UI copy is in Ukrainian.
