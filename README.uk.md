# HAM Application Portal

> 🌐 **Інші мови:** [English](README.md)

ITSM / ITIL-портал заявок для керування сервісними запитами, інцидентами, запитами на зміни, проблемами та базою знань. Побудований як два незалежні npm-проєкти (бекенд + фронтенд) зі сховищем SQLite, автоматичною ескалацією SLA та моніторингом Prometheus/Grafana.

## Можливості

- **Заявки** — сервісні запити та інциденти з пріоритетом, робочим процесом статусів (`NEW → IN_PROGRESS → RESOLVED → CLOSED`), дедлайнами SLA та повним аудит-журналом.
- **Каталог сервісів** — ITIL-вирівняні сервіси, згруповані за категоріями.
- **Керування змінами** — запити на зміни (стандартні/нормальні/аварійні) з робочим процесом `DRAFT → PENDING → APPROVED/REJECTED → IMPLEMENTED`.
- **Керування проблемами** — робочий процес `NEW → RCA → KNOWN_ERROR → RESOLVED` з відстеженням першопричини та обхідного рішення.
- **База знань** — статті у форматі Markdown зі станами `DRAFT`/`PUBLISHED`/`ARCHIVED` і повнотекстовим пошуком.
- **Звітна панель (дашборд)** — MTTR, дотримання SLA, обсяг інцидентів за сервісами та розподіл за статусами (графіки на D3).
- **Автоматична ескалація SLA** — cron-завдання підвищує пріоритет заявок, що наближаються до дедлайну, до `CRITICAL`.
- **Аудит-журнал** — кожна зміна статусу заявки фіксується в `AuditLog`.
- **Моніторинг** — метрики Prometheus на `/metrics` та екземпляр Grafana через Docker.

## Технологічний стек

| Рівень   | Технології |
| -------- | ---------- |
| Бекенд   | Node.js, Express 5, TypeScript, Prisma 5 (SQLite), node-cron, prom-client |
| Фронтенд | React 19, Vite, TypeScript, Tailwind CSS, D3 |
| Ops      | Docker Compose, Prometheus, Grafana, rclone-бекап |

## Архітектура

Два незалежні npm-проєкти без спільного пакунка чи монорепо-інструментів — встановлюйте та запускайте кожен окремо.

### Бекенд (`src/`)

Express + TypeScript + Prisma (SQLite), точка входу `src/index.ts` (порт 3000 за замовчуванням).

- **Route → controller** (без сервісного/репозиторного шару); контролери у `src/controllers/*` звертаються до Prisma напряму через `src/config/db.ts`.
- **Доменні моделі** (`prisma/schema.prisma`): `Application` опціонально пов'язана з `ServiceCatalog`, `ChangeRequest` та `Problem`; `Problem` може мати одну `KnowledgeArticle`.
- **Автентифікація — заглушка**: `authMiddleware.ts` читає заголовок `x-user-role` (`USER` / `ADMIN`) — сесій, токенів чи таблиці користувачів немає.
- **Ескалація SLA** (`cronJobs.ts`): запускається кожні 15 хвилин і підвищує до `CRITICAL` будь-яку не закриту та не `CRITICAL` заявку, до `slaDeadline` якої залишилося менш ніж 30 хвилин, записуючи відповідний `AuditLog` у тій самій транзакції.
- **Метрики**: Prometheus middleware (лічильник/гістограма запитів) і gauge квитків за статусами, доступні на `/metrics`.

API-маршрути:

- `/api/applications` — заявки
- `/api/services` — каталог сервісів
- `/api/changes` — запити на зміни
- `/api/problems` — записи проблем
- `/api/kb` — статті бази знань
- `/api/reports` — звітна статистика
- `/api/health` — перевірка стану
- `/metrics` — метрики Prometheus

### Фронтенд (`frontend/`)

React 19 + Vite + TypeScript + Tailwind, односторінковий застосунок (без роутера). `App.tsx` відповідає за список/дошку заявок і перемикає компоненти (`Dashboard`, `ChangeBoard`, `ProblemBoard`, `KnowledgeBoard`, `AuditTimeline`) у `frontend/src/components/`.

- Графіки дашборда побудовані вручну на **D3** (без бібліотеки графіків).
- Базова URL-адреса API зашита як `http://localhost:3000/api/...` у файлах компонентів.
- Текст інтерфейсу — українською.

## Передумови

- Node.js 20+ (Docker використовує `node:20-alpine`)
- npm

## Швидкий старт

### Бекенд (корінь репозиторію)

```bash
npm install

# База SQLite знаходиться у prisma/dev.db
export DATABASE_URL="file:./dev.db"

npx prisma migrate dev   # застосувати/створити міграції
npx prisma generate      # перегенерувати Prisma Client
npx prisma db seed       # наповнити каталог сервісів

npm run dev              # запустити API через nodemon (порт 3000)
```

> У репозиторії немає закоміченого файлу `.env`. Встановіть `DATABASE_URL` (і за потреби `PORT`) самостійно, напр. `DATABASE_URL="file:./dev.db"`.

### Фронтенд (`frontend/`)

```bash
cd frontend
npm install
npm run dev   # dev-сервер Vite
```

## Команди

Бекенд (корінь репозиторію):

- `npm run dev` — запустити API через nodemon (`src/index.ts`, порт 3000 за замовчуванням)
- `npm run build` — скомпілювати TypeScript у `dist/` через `tsc`
- `npm start` — запустити скомпільований сервер (`dist/index.js`)
- `npx prisma migrate dev` — застосувати/створити міграцію Prisma
- `npx prisma generate` — перегенерувати Prisma Client після змін схеми
- `npx prisma db seed` — запустити `prisma/seed.ts`

Фронтенд (`frontend/`):

- `npm run dev` — dev-сервер Vite
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — `oxlint`
- `npm run preview` — перегляд production-збірки

## Docker

`docker-compose.yml` у корені запускає:

- `backend` — Express API на порту 3000
- `frontend` — статична збірка на nginx на порту 80 (проксіює `/api/` на бекенд)
- `backup` — rclone + Slack webhook для бекапу бази SQLite (cron о 03:00)
- `prometheus` (порт 9090) і `grafana` (порт 3001) для метрик

```bash
docker compose up --build
```

## Змінні середовища

| Змінна             | Хто використовує | Опис |
| ------------------ | ---------------- | ---- |
| `DATABASE_URL`     | бекенд           | Рядок підключення SQLite (напр. `file:./dev.db`) |
| `PORT`             | бекенд           | Порт API (за замовчуванням `3000`) |
| `SLACK_WEBHOOK_URL`| backup           | Необов'язковий Slack webhook для сповіщень про бекап |
| `RCLONE_REMOTE`    | backup           | Необов'язковий rclone remote для копій бекапу |

## Ліцензія

Див. [LICENSE](LICENSE).
