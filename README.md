# HAM Application Portal

> 🌐 **Other languages:** [Українська](README.uk.md)

An ITSM / ITIL-style application portal for managing service requests, incidents, change requests, problems, and a knowledge base. Built as two independent npm projects (backend + frontend) with SQLite storage, SLA auto-escalation, and Prometheus/Grafana monitoring.

## Features

- **Applications (tickets)** — service requests and incidents with priority, status workflow (`NEW → IN_PROGRESS → RESOLVED → CLOSED`), SLA deadlines, and full audit logging.
- **Service catalog** — ITIL-aligned services grouped by category.
- **Change management** — standard/normal/emergency change requests with a DRAFT → PENDING → APPROVED/REJECTED → IMPLEMENTED workflow.
- **Problem management** — NEW → RCA → KNOWN_ERROR → RESOLVED workflow with root-cause and workaround tracking.
- **Knowledge base** — Markdown articles with DRAFT/PUBLISHED/ARCHIVED states and full-text search.
- **Reporting dashboard** — MTTR, SLA compliance, incident volume by service, and status distribution (D3 charts).
- **SLA auto-escalation** — a cron job escalates tickets nearing their deadline to `CRITICAL`.
- **Audit trail** — every application status change is recorded in `AuditLog`.
- **Monitoring** — Prometheus metrics at `/metrics` plus a Grafana instance via Docker.

## Tech stack

| Layer    | Technologies |
| -------- | ------------ |
| Backend  | Node.js, Express 5, TypeScript, Prisma 5 (SQLite), node-cron, prom-client |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, D3 |
| Ops      | Docker Compose, Prometheus, Grafana, rclone backup |

## Architecture

Two independent npm projects with no shared package or monorepo tooling — install and run each separately.

### Backend (`src/`)

Express + TypeScript + Prisma (SQLite), entry point `src/index.ts` (port 3000 by default).

- **Route → controller** pattern (no service/repository layer); controllers in `src/controllers/*` talk to Prisma directly via `src/config/db.ts`.
- **Domain models** (`prisma/schema.prisma`): `Application` links optionally to `ServiceCatalog`, `ChangeRequest`, and `Problem`; `Problem` can have one `KnowledgeArticle`.
- **Auth is a stand-in**: `authMiddleware.ts` reads the `x-user-role` header (`USER` / `ADMIN`) — there is no session, token, or user table.
- **SLA escalation** (`cronJobs.ts`): runs every 15 minutes and bumps any non-closed, non-`CRITICAL` application within 30 minutes of `slaDeadline` to `CRITICAL`, writing a matching `AuditLog` in the same transaction.
- **Metrics**: Prometheus request counter/histogram middleware plus a ticket-by-status gauge, exposed at `/metrics`.

API routes:

- `/api/applications` — tickets
- `/api/services` — service catalog
- `/api/changes` — change requests
- `/api/problems` — problem records
- `/api/kb` — knowledge articles
- `/api/reports` — reporting stats
- `/api/health` — health check
- `/metrics` — Prometheus metrics

### Frontend (`frontend/`)

React 19 + Vite + TypeScript + Tailwind, single-page (no router). `App.tsx` owns the applications list/board and switches between feature components (`Dashboard`, `ChangeBoard`, `ProblemBoard`, `KnowledgeBoard`, `AuditTimeline`) in `frontend/src/components/`.

- Dashboard charts are hand-built with **D3** (no chart library).
- The API base URL is hardcoded to `http://localhost:3000/api/...` in the component files.
- UI copy is in Ukrainian.

## Prerequisites

- Node.js 20+ (Docker uses `node:20-alpine`)
- npm

## Getting started

### Backend (repo root)

```bash
npm install

# SQLite database lives at prisma/dev.db
export DATABASE_URL="file:./dev.db"

npx prisma migrate dev   # apply/create migrations
npx prisma generate      # regenerate the Prisma client
npx prisma db seed       # seed the service catalog

npm run dev              # run the API with nodemon (port 3000)
```

> There is no `.env` file committed to the repo. Set `DATABASE_URL` (and optionally `PORT`) yourself, e.g. `DATABASE_URL="file:./dev.db"`.

### Frontend (`frontend/`)

```bash
cd frontend
npm install
npm run dev   # Vite dev server
```

## Commands

Backend (repo root):

- `npm run dev` — run the API with nodemon (`src/index.ts`, port 3000 by default)
- `npm run build` — compile TypeScript to `dist/` via `tsc`
- `npm start` — run the compiled server (`dist/index.js`)
- `npx prisma migrate dev` — apply/create a Prisma migration
- `npx prisma generate` — regenerate the Prisma client after schema changes
- `npx prisma db seed` — run `prisma/seed.ts`

Frontend (`frontend/`):

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — `oxlint`
- `npm run preview` — preview the production build

## Docker

`docker-compose.yml` at the root wires up:

- `backend` — Express API on port 3000
- `frontend` — nginx-served static build on port 80 (proxies `/api/` to the backend)
- `backup` — rclone + Slack webhook backup of the SQLite DB (cron at 03:00)
- `prometheus` (port 9090) and `grafana` (port 3001) for metrics

```bash
docker compose up --build
```

## Environment variables

| Variable | Used by | Description |
| -------- | ------- | ----------- |
| `DATABASE_URL` | backend | SQLite connection string (e.g. `file:./dev.db`) |
| `PORT` | backend | API port (default `3000`) |
| `SLACK_WEBHOOK_URL` | backup | Optional Slack webhook for backup notifications |
| `RCLONE_REMOTE` | backup | Optional rclone remote for off-site backup copies |

## License

See [LICENSE](LICENSE).
