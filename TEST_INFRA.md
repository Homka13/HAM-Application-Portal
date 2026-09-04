# E2E Test Infra: HAM Portal Iteration 2 (ClickUp + Notifications)

## Test Philosophy
- Opaque-box, requirement-driven testing. Derived strictly from `ORIGINAL_REQUEST.md` without internal coupling.
- Native Node.js Test Runner (`node --test`), assertion library (`node:assert/strict`), and `supertest`.
- Full offline mock isolation for external networks (ClickUp REST API, ClickUp Webhooks, SMTP Server, Slack Webhooks, Slack Bot API).

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
|---|---------|-------------|:-----------------:|:-----------------:|:----------------------:|:-------------------:|
| 1 | Single Seam Event Hook | ORIGINAL_REQUEST §R1 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 2 | ClickUp Task Creation & Mapping | ORIGINAL_REQUEST §R2 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 3 | ClickUp Outbound Status Sync | ORIGINAL_REQUEST §R2 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 4 | ClickUp Inbound Webhook & HMAC | ORIGINAL_REQUEST §R2 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 5 | ClickUp Loop Suppression | ORIGINAL_REQUEST §R2 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 6 | ClickUp Graceful Degradation | ORIGINAL_REQUEST §R2 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 7 | Notification Matrix Routing (12 statuses) | ORIGINAL_REQUEST §R3 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 8 | Gmail / SMTP Channel Delivery | ORIGINAL_REQUEST §R3 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 9 | Slack Channel & Direct DM Delivery | ORIGINAL_REQUEST §R3 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 10 | Notification Graceful Degradation | ORIGINAL_REQUEST §R3 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 11 | Guardrails & Prioritization Integrity | ORIGINAL_REQUEST §R4 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 12 | UI clickupTaskId & Showcase Bundle Exclusion | ORIGINAL_REQUEST §R4 | ≥5 tests | ≥5 tests | ✓ | ✓ |
| 13 | Build, Docker & Render Deployment | ORIGINAL_REQUEST §R5, §R7 | ≥5 tests | ≥5 tests | ✓ | ✓ |

## Test Architecture
- **Runner**: `npm test` (`npm run build && node --test test/unit/*.test.js test/integration/*.test.js test/smoke.test.js test/e2e/*.test.js`)
- **Test Locations**:
  - `test/unit/event-seam.test.js`: R1 single seam hook unit tests
  - `test/unit/clickup.test.js`: R2 ClickUp client, field mapping, degradation unit tests
  - `test/unit/notify.test.js`: R3 Notification 12-status matrix, Gmail & Slack unit tests
  - `test/integration/webhook.test.js`: R2 Inbound webhook routing, HMAC, status sync, rework loop
  - `test/integration/guardrails-and-bundle.test.js`: R4 App.tsx prioritization, WSJF, DesignShowcase bundle exclusion
  - `test/e2e/e2e-workflow.test.js`: Full lifecycle end-to-end integration tests

## Real-World Application Scenarios (Tier 4)
1. **Branch A Full Lifecycle**: Request created -> `NEW` (POC notified) -> `TZ_PREPARATION` -> `ESTIMATION` -> `IN_PROGRESS` (ClickUp task created, task ID saved, requester notified) -> `TESTING` -> `UAT` (Direct Slack DM + Email) -> `RESOLVED` (Resolution note sent) -> `CLOSED`.
2. **Branch D Approval & Rejection Flow**: Access request created -> `PENDING_APPROVAL` (Approver notified) -> `APPROVED` (ClickUp task created, IT Ops notified) -> `IN_PROGRESS` -> `RESOLVED`. Alternate flow: `PENDING_APPROVAL` -> `REJECTED` (Rejection reason sent to requester).
3. **Branch C Critical Incident Triaging**: Security incident created -> `TRIAGE` (On-call broadcast alert) -> `IN_PROGRESS` (ClickUp task created with CRITICAL priority) -> `RESOLVED`.
4. **ClickUp Inbound Sync & Rework Loop**: Developer moves task to "На перевірці" in ClickUp -> Webhook triggers portal transition to `UAT` (Requester notified) -> Review fails -> Task moved to "На доопрацювання" in ClickUp -> Webhook triggers portal transition to `TZ_PREPARATION` (Rework loop, team notified).
5. **Zero-Config Resilient Server Run**: Server booted in fresh environment with zero ClickUp, Slack, or SMTP env vars. Applications created, transitioned, and updated across all branches with 100% success and clean logs (zero crashes, zero 500 errors).

## Coverage Thresholds
- Tier 1: ≥5 per feature (~65 test cases across 13 feature areas)
- Tier 2: ≥5 boundary / corner / error cases per feature (~65 test cases)
- Tier 3: Pairwise cross-feature interactions (≥15 test cases)
- Tier 4: ≥5 realistic end-to-end workload application scenarios
- Total Target: ≥150 test assertions covering 100% of Iteration 2 requirements.
