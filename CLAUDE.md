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

# Frontend (ai-workflow-canvas-vue/)
cd ai-workflow-canvas-vue && npm run dev    # vite dev (proxies /api → :3000)
cd ai-workflow-canvas-vue && npm run build  # vue-tsc + vite build → dist/

# Deploy to Ningxia server
./scripts/deploy.sh             # build frontend → SCP via jump host → restart service
```

No tests or linters are configured.

## Architecture

```
ai-workflow-canvas-vue/   Vue 3 + Vite + TypeScript + Tailwind CSS + VueFlow SPA
server/                   Express + Prisma + TypeScript API server
  src/index.ts            Entry: helmet → compression → cors → rate-limit → routes → /api/health
  src/lib/prisma.ts       PrismaClient singleton
  src/lib/providers/      Image generation providers (sophnet, seedream/SSE)
  src/middleware/auth.ts  JWT auth + admin guard (15min access, 7d refresh)
  src/routes/             auth, users, models, generate, canvas, assets, credits
scripts/deploy.sh         Push frontend dist + backend tsc to production via jump host
```

## Key patterns

- **Auth**: `req.user = { userId, username, role, tokenVersion }` set by `authMiddleware`. Routes use `authorize(ownerUserId)` pattern for ownership checks.
- **API client**: `useAuth().apiFetch()` auto-attaches Bearer token and refreshes on 401.
- **Canvas persistence**: VueFlow nodes/edges auto-save to server with 800ms debounce.
- **Credit system**: Fast-fail balance check → optimistic deduction → refund on failure (via Prisma `$transaction`).
- **No Pinia/Vuex**: State lives in composables (`useAuth`) and component-local refs.
- **Relative imports only**: No path aliases in either project.

## Environment variables (server/.env)

```
DATABASE_URL=postgresql://user@localhost:5432/ai_canvas?schema=public
JWT_ACCESS_SECRET=<random>
JWT_REFRESH_SECRET=<random>
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

## Database

PostgreSQL with Prisma. Schema: User → Canvas → GeneratedAsset, User → CreditTransaction, AiModel (standalone). Binary targets include `rhel-openssl-1.0.x` for CentOS 7 production compatibility. No seed file exists.

## Production deployment

See `DEPLOY.md` for full server inventory, SSH keys, access commands, and maintenance procedures. Key points:

- **Entry**: `http://163.61.202.138:18080` (LB, needs config to reach `176.2.0.15:5179`). Use SSH tunnel for local access.
- **App server**: `176.2.0.15` (via jump `163.61.202.173:10026`), no internet. Frontend built locally, backend tsc on server.
- **Backend managed by**: `systemctl` (canvas-api.service)
- **Deploy**: `./scripts/deploy.sh`
