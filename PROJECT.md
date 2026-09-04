# Project: HAM Portal Iteration 2 (ClickUp + Notifications)

## Architecture
HAM Portal is a TypeScript fullstack service application (Express 5 backend + React Vite frontend) managing IT service requests, incidents, changes, and problems across a 12-status lifecycle.

### Data Flow & Component Architecture
1. **Core Seam (`src/controllers/applicationController.ts`)**:
   - Manages state transitions across Branch A/B/E, Branch C, and Branch D.
   - Exports `appEvents` (`EventEmitter`) and emits `application:status_changed` / `statusTransition` with `{ app, from, to, actorRole, changedBy, resolutionNote, rejectionReason, timestamp }` strictly on successful persistence (PostgreSQL transaction commit or `localStore` fallback update).
2. **ClickUp Integration (`src/lib/clickup.ts` & `src/routes/webhookRoutes.ts`)**:
   - Subscribes to `appEvents`.
   - On transition to `IN_PROGRESS` (Branch A/B/E, C, D) or `APPROVED` (Branch D), creates a ClickUp task if `!app.clickupTaskId` and stores `clickupTaskId`.
   - On subsequent transitions, updates task status in ClickUp.
   - Inbound webhook handler at `POST /api/webhooks/clickup` verifies HMAC `x-signature`, parses ClickUp status updates, maps them to portal statuses (e.g. `на перевірці` -> `UAT`, `на доопрацювання` -> `TZ_PREPARATION`), and executes valid transitions via controller.
   - Infinite loop prevention: `changedBy: 'ClickUp Webhook'` tag + status idempotency check + in-flight cache.
   - Graceful degradation: If `CLICKUP_API_KEY` or `CLICKUP_LIST_ID` is missing, operations safely no-op with structured logs.
3. **Notification Engine (`src/lib/notify.ts`)**:
   - Subscribes to `appEvents`.
   - Routes notifications across the 12-status lifecycle matrix:
     * `NEW`: Requester email + POC/Team channel alert
     * `PENDING_APPROVAL`: Approvers alert
     * `APPROVED`: Requester confirmation + IT Ops fulfillment notice
     * `TRIAGE`: Critical on-call alert
     * `UAT`: Requester email + direct Slack DM
     * `RESOLVED` / `REJECTED`: Requester email + direct Slack DM with resolution note / rejection reason
     * `CLOSED`: Requester completion notice
   - Channels: Gmail (Nodemailer / SMTP) and Slack (Webhooks + Bot Token for direct DMs).
   - Graceful degradation: Missing channel credentials result in safe no-ops without throwing unhandled exceptions.
4. **Guardrails & UI (`frontend/src/App.tsx`, `frontend/src/components/DesignShowcase.tsx`)**:
   - Preserves core prioritization formulas (WSJF, SLA matrix, transition guards) 100% intact.
   - Minimal UI addition: Display `clickupTaskId` in expanded application detail card.
   - `DesignShowcase.tsx` remains excluded and tree-shaken from the production bundle.
5. **Deployment & Safety (`Dockerfile`, `README.md`, `.env.example`)**:
   - Multi-stage Docker build producing standalone `dist/index.js` (esbuild).
   - Zero hardcoded secrets; full environment configuration documented in `.env.example` and `README.md`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Single Seam Event Hook | Node.js EventEmitter in `applicationController.ts` emitting `{ app, from, to, actorRole, ... }` on successful transitions | M1 | ORIGINAL_REQUEST §R1 |
| 2 | ClickUp Task Creation | Creates ClickUp task on `IN_PROGRESS` or `APPROVED`, maps fields (WSJF, SLA, requester), stores `clickupTaskId` | M2 | ORIGINAL_REQUEST §R2 |
| 3 | ClickUp Outbound Status Sync | Synchronizes subsequent portal status transitions to ClickUp tasks | M2 | ORIGINAL_REQUEST §R2 |
| 4 | ClickUp Webhook Route & HMAC | `POST /api/webhooks/clickup` with `x-signature` HMAC-SHA256 verification and secret matching | M2 | ORIGINAL_REQUEST §R2 |
| 5 | ClickUp Bidirectional Mapping & Rework Loop | Maps ClickUp statuses to portal statuses (including UAT, rework loop to TZ_PREPARATION) | M2 | ORIGINAL_REQUEST §R2 |
| 6 | ClickUp Loop Suppression & Idempotency | Suppresses echoes using `changedBy: 'ClickUp Webhook'`, status idempotency, and deduplication | M2 | ORIGINAL_REQUEST §R2 |
| 7 | ClickUp Graceful Degradation | Safe no-op logging when `CLICKUP_API_KEY` or `CLICKUP_LIST_ID` is unconfigured | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Notification Matrix Dispatcher | Event listener in `src/lib/notify.ts` evaluating 12-status matrix and dispatching channel messages | M3 | ORIGINAL_REQUEST §R3 |
| 9 | Gmail / SMTP Channel | Formats and sends email alerts with HTML templates via nodemailer/SMTP | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Slack Channel (Webhooks + DM) | Broadcast alerts via incoming webhooks and direct Slack DMs via Bot Token user lookup | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Notification Graceful Degradation | Safe no-op logging when SMTP or Slack credentials are missing | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Prioritization & Logic Guardrails | Zero changes to WSJF, SLA thresholds, or App.tsx state machines | M4 | ORIGINAL_REQUEST §R4 |
| 13 | UI Minor Extension | Clean display of `clickupTaskId` in expanded card view | M4 | ORIGINAL_REQUEST §R4 |
| 14 | DesignShowcase Bundle Safety | Verify DesignShowcase is tree-shaken and absent from `dist/assets` | M4 | ORIGINAL_REQUEST §R4 |
| 15 | Deployment, Docker & Docs | Multi-stage Docker build verification, `.env.example`, `README.md` documentation, zero secrets | M4 | ORIGINAL_REQUEST §R6, §R7 |
| 16 | E2E Test Suite Design | Opaque-box test harness and test cases covering Tiers 1-4 | Test Track | ORIGINAL_REQUEST §R5 |
| 17 | Final Acceptance & Adversarial Hardening | 100% test pass on Tiers 1-4 + Tier 5 adversarial coverage hardening and clean forensic audit | M5 | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| TT | E2E Testing Track | Test harness, mocks for ClickUp/Gmail/Slack, Tiers 1-4 test suite, publish `TEST_READY.md` | Survey | PLANNED |
| M1 | Event Hook Seam (R1) | `appEvents` EventEmitter in `src/controllers/applicationController.ts`, emit on success | Survey | PLANNED |
| M2 | ClickUp Integration (R2) | `src/lib/clickup.ts`, `src/routes/webhookRoutes.ts`, webhook route wiring in `src/index.ts` | M1 | PLANNED |
| M3 | Notifications System (R3) | `src/lib/notify.ts`, 12-status matrix, Gmail & Slack channels, init in `src/index.ts` | M1 | PLANNED |
| M4 | Guardrails, UI & Deployment (R4, R6, R7) | UI `clickupTaskId` display, bundle check, `.env.example`, `README.md`, Docker build check | M2, M3 | PLANNED |
| M5 | Final Milestone: E2E Acceptance & Adversarial Hardening (R5) | 100% pass on Tiers 1-4, Tier 5 adversarial tests, Forensic Integrity Audit (CLEAN) | TT, M4 | PLANNED |

## Interface Contracts

### `src/controllers/applicationController.ts` ↔ Downstream Subsystems
```typescript
import { EventEmitter } from 'node:events';

export interface StatusTransitionEvent {
  app: any; // Application model or LocalApplication
  from: string | null;
  to: string;
  actorRole?: string;
  changedBy?: string;
  resolutionNote?: string;
  rejectionReason?: string;
  timestamp: string;
}

export const appEvents: EventEmitter;
// Event name: 'application:status_changed' AND 'statusTransition'
```

### `src/lib/clickup.ts` API Contract
```typescript
export interface ClickUpConfig {
  apiKey?: string;
  listId?: string;
  webhookSecret?: string;
}

export function initClickUpIntegration(): void;
export async function createClickUpTask(app: any): Promise<string | null>;
export async function updateClickUpTaskStatus(taskId: string, status: string): Promise<boolean>;
export async function handleInboundClickUpWebhook(payload: any, signature?: string): Promise<{ success: boolean; message: string }>;
export function verifyClickUpSignature(payload: string | Buffer, signature: string, secret: string): boolean;
```

### `src/lib/notify.ts` API Contract
```typescript
export interface NotificationPayload {
  channel: 'email' | 'slack' | 'both';
  recipient: string;
  subject: string;
  message: string;
  html?: string;
  metadata?: Record<string, any>;
}

export function initNotificationListeners(): void;
export async function dispatchStatusNotification(event: StatusTransitionEvent): Promise<void>;
export async function sendEmailNotification(to: string, subject: string, text: string, html?: string): Promise<boolean>;
export async function sendSlackNotification(channelUrl: string, message: string, userEmail?: string): Promise<boolean>;
```

## Code Layout & File Boundaries
- `src/controllers/applicationController.ts`: Exclusively owned by M1 (single seam hook).
- `src/lib/clickup.ts`, `src/routes/webhookRoutes.ts`: Exclusively owned by M2 (ClickUp integration).
- `src/lib/notify.ts`: Exclusively owned by M3 (Notification engine).
- `src/index.ts`: M2 and M3 wire router and init listeners.
- `frontend/src/App.tsx`, `README.md`, `.env.example`: Exclusively owned by M4.
- `test/unit/clickup.test.js`, `test/unit/notify.test.js`, `test/integration/webhook.test.js`, `test/e2e/*.test.js`: Owned by E2E Testing Track and Milestone builders.
