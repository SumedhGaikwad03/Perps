# Local Development Setup Guide

Follow this guide to bootstrap, configure, and run the entire Perps Trading Platform locally.

---

## 1. System Prerequisites

1. **Bun**: v1.4.3 or higher. Check with `bun --version`.
2. **Node.js**: v20 or higher (for auxiliary tooling).
3. **Docker / Podman**: To run local instances of PostgreSQL and Redis.
4. **Git**: Version control.

---

## 2. Infrastructure Setup (Docker)

Spin up local PostgreSQL and Redis instances:

```bash
# Start PostgreSQL (Port 5432)
docker run -d --name perps-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=perps_db \
  -p 5432:5432 \
  postgres:16-alpine

# Start Redis (Port 6379)
docker run -d --name perps-redis \
  -p 6379:6379 \
  redis:7-alpine
```

---

## 3. Repository Installation & Database Migration

```bash
# 1. Clone the repository and navigate to Perps workspace
cd Perps

# 2. Install monorepo dependencies
bun install

# 3. Apply database migrations to PostgreSQL
cd packages/db
bunx prisma migrate dev --name init
bunx prisma generate
cd ../..
```

---

## 4. Starting Platform Services

For optimal stability, start the backend services in sequential terminals:

### Terminal 1: Matching Engine (`apps/engine`)
```bash
cd apps/engine
bun run index.ts
```
*Expected Output: `engine has started` and `all the background daemons are now working here`.*

### Terminal 2: DB Events Worker (`apps/db-events`)
```bash
cd apps/db-events
bun run index.ts
```
*Expected Output: `db worker is now running with the key as db-events and with group db-consumer-group`.*

### Terminal 3: REST Backend (`apps/backend`)
```bash
cd apps/backend
bun run index.ts
```
*Expected Output: `server is running on port 3000 broo`.*

### Terminal 4: WebSocket Gateway (`apps/ws`)
```bash
cd apps/ws
bun run index.ts
```
*Expected Output: `ws gateway is listening on ws://localhost:3001`.*

### Terminal 5: Web Frontend (`apps/web`)
```bash
cd apps/web
bun run dev
```
*Open [http://localhost:5173](http://localhost:5173) in your browser.*
