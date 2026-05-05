# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (both servers)
npm run dev                     # concurrently: backend tsx watch + frontend vite

# Backend (server/)
cd server && npm run dev        # tsx watch src/index.ts (hot-reload)
cd server && npm run build      # tsc → dist/
cd server && npm run db:migrate # prisma migrate dev (dev DB)
cd server && npm run db:migrate:prod  # prisma migrate deploy (CI/prod)
cd server && npm run db:seed    # tsx prisma/seed.ts
cd server && npm test           # vitest run (integration tests)

# Frontend (ai-workflow-canvas-vue/)
cd ai-workflow-canvas-vue && npm run dev    # vite dev (proxies /api → :3000)
cd ai-workflow-canvas-vue && npm run build  # vue-tsc + vite build → dist/

# Deploy to Ningxia server
./scripts/deploy.sh             # build frontend + SCP via jump host + restart service + sync models
```

## Architecture

```
ai-workflow-canvas-vue/   Vue 3 + Vite + TypeScript + Tailwind CSS + VueFlow SPA
server/                   Express + Prisma + TypeScript API server
  src/index.ts            Entry point — starts listening on PORT
  src/app.ts              Express app setup (middleware chain + route mounts)
  src/lib/prisma.ts       PrismaClient singleton
  src/lib/storage.ts      Image download/save (URL fetch + base64 decode → data/assets/)
  src/lib/providers/      Image generation providers (sophnet, seedream/SSE stream)
    types.ts              GenerateRequest, GenerateResult, ImageProvider interface
  src/middleware/auth.ts  JWT auth + admin guard + tokenVersion cache (30s TTL)
  src/routes/             auth, users, models, generate, canvas, assets, credits
server/test/              Integration tests (vitest + supertest, hit real DB)
  setup.ts                Exports app, prisma, uid(), cleanup()
  auth.test.ts            Registration, login, refresh, logout
  canvas.test.ts          Canvas CRUD
  generate.test.ts        Image generation endpoints
  models.test.ts          Model listing and CRUD
scripts/
  deploy.sh               Full production deploy pipeline (7 steps including model sync)
  sync-models.ts          Read AiModel rows from local DB → UPSERT SQL for production
```

`app.ts` is separated from `index.ts` so tests can import the Express app without starting a server. Rate-limiting is skipped when `NODE_ENV=test`.

## Key patterns

- **Auth**: `req.user = { userId, username, role, tokenVersion }` set by `authMiddleware`. Routes use `authorize(ownerUserId)` pattern for ownership checks. Token version is cached in memory (30s TTL) to reduce DB queries; `clearTvCache(userId)` on logout/password change.
- **API client**: `useAuth().apiFetch()` auto-attaches Bearer token and refreshes on 401.
- **Canvas persistence**: VueFlow nodes/edges auto-save to server with 800ms debounce.
- **Credit system**: Fast-fail balance check → optimistic deduction → refund on failure (via Prisma `$transaction`).
- **No Pinia/Vuex**: State lives in composables (`useAuth`) and component-local refs.
- **Relative imports only**: No path aliases in either project.

## Tests

Integration tests use vitest + supertest against a real database. Setup pattern:

```ts
import { app, uid, cleanup, prisma } from './setup'
// uid('group', 'name') → 'test_group_name_<timestamp>' (unique per run)
// cleanup('group') → cascade-deletes test data
```

Test env requires `DATABASE_URL` pointing to a test DB, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `NODE_ENV=test`. CI runs via GitHub Actions with a postgres:16-alpine service container, running migrations then `vitest run`. Tests are single-threaded (`fileParallelism: false`) to avoid migration conflicts.

## Environment variables (server/.env, see .env.example for template)

```
DATABASE_URL=postgresql://user@localhost:5432/ai_canvas?schema=public
JWT_ACCESS_SECRET=<random>
JWT_REFRESH_SECRET=<random>
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

## Database

PostgreSQL with Prisma. Schema: User → Canvas → GeneratedAsset, User → CreditTransaction, AiModel (standalone). Binary targets include `rhel-openssl-1.0.x` for CentOS 7 production compatibility.

## CI (GitHub Actions)

`.github/workflows/ci.yml` — 3 jobs: Frontend Build (vue-tsc + vite), Backend Build (tsc + prisma generate), Integration Tests (needs postgres service, runs vitest). Triggered on push/PR to main.

## Production deployment

See `DEPLOY.md` for full server inventory, SSH keys, access commands, and maintenance procedures. Key points:

- **Entry**: `http://163.61.202.138:18080` (LB, needs config to reach `176.2.0.15:5179`). Use SSH tunnel for local access.
- **App server**: `176.2.0.15` (via jump `163.61.202.173:10026`), no internet. Frontend built locally, backend tsc on server.
- **Backend managed by**: `systemctl` (canvas-api.service)
- **Deploy**: `./scripts/deploy.sh` — also syncs AiModel rows from local DB to production via UPSERT SQL.
