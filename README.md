# Perps Trading Platform

A high-performance, event-driven decentralized perpetual futures exchange built with **TypeScript**, **Bun**, **Turborepo**, **Express**, **Redis Streams**, **PostgreSQL** ([Prisma ORM](https://www.prisma.io)), and **React** (Vite + Tailwind CSS).

For complete, production-grade technical and architectural documentation, refer to the [docs/](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/README.md) directory.

---

## Architecture Overview

```
                      ┌───────────────────────┐
                      │    Web Terminal UI    │
                      │       (apps/web)      │
                      └───────────┬───────────┘
                                  │ HTTP / WS
            ┌─────────────────────┴─────────────────────┐
            ▼                                           ▼
┌───────────────────────┐                   ┌───────────────────────┐
│     REST Gateway      │                   │   WebSocket Gateway   │
│     (apps/backend)    │                   │       (apps/ws)       │
└───────────┬───────────┘                   └───────────▲───────────┘
            │ xAdd 'engine'                             │ Pub/Sub & Hashes
            ▼                                           │
┌───────────────────────────────────────────────────────┴───────────┐
│                           Redis 7 Server                          │
│   Streams: 'engine' | 'to-backend' | 'db-events'                  │
│   Hashes:  market:*:depth | user:*:balances | user:*:open_orders  │
│   PubSub:  pub:depth:* | pub:trades:* | pub:user:*                │
└───────────▲───────────────────────────────────────────▲───────────┘
            │ xReadGroup                                │ xAdd
            ▼                                           │
┌───────────────────────┐                   ┌───────────┴───────────┐
│    Matching Engine    │                   │   DB Events Worker    │
│     (apps/engine)     │                   │    (apps/db-events)   │
└───────────▲───────────┘                   └───────────┬───────────┘
            │ Mark Prices                               │ Prisma Transactions
            │                                           ▼
┌───────────┴───────────┐                   ┌───────────────────────┐
│   Binance Futures WS  │                   │  PostgreSQL Database  │
└───────────────────────┘                   └───────────────────────┘
```

---

## Applications & Packages

### Applications (`apps/`)
* **[apps/backend](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/README.md)**: Express REST API server providing user authentication, order submission via Redis loopback, collateral on-ramp/off-ramp, and cached orderbook queries.
* **[apps/engine](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/README.md)**: Deterministic in-memory matching engine, risk manager, liquidation sweeper (1s interval), hourly funding settlements, and Binance mark price oracle.
* **[apps/ws](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/ws/README.md)**: Real-time WebSocket streaming gateway bridging Redis Pub/Sub channels (`depth`, `trades`, `user`) to browsers.
* **[apps/db-events](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/db-events/README.md)**: Background consumer group worker persisting trade fills, orders, positions, and balances to PostgreSQL.
* **[apps/web](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/README.md)**: Vite + React 19 trading terminal with TradingView charts, Zustand state management, and real-time orderbook ladders.
* **[apps/tests](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/tests/README.md)**: 24-suite integration test harness executing end-to-end multi-party trading simulations.
* **[apps/docs](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/docs/README.md)**: Next.js documentation portal scaffold.

### Shared Packages (`packages/`)
* **[packages/common](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/common/README.md)**: Shared TypeScript types, domain models, and Redis event payload contracts.
* **[packages/db](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/db/README.md)**: PostgreSQL Prisma 7 schema, migrations, and `@prisma/adapter-pg` client.
* **[packages/eslint-config](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/eslint-config/README.md)**: Monorepo ESLint configurations.
* **[packages/typescript-config](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/typescript-config/package.json)**: Shared tsconfig presets.
* **[packages/ui](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/ui/package.json)**: Shared React UI components.

---

## Quick Start

### 1. Prerequisites
* [Bun v1.4.3+](https://bun.com)
* PostgreSQL 16 (Port 5432)
* Redis 7 (Port 6379)

### 2. Installation & Migrations
```bash
# Install dependencies across all workspaces
bun install

# Apply database migrations
cd packages/db
bunx prisma migrate dev --name init
bunx prisma generate
cd ../..
```

### 3. Launching Services
Run the following in separate terminals:
```bash
# 1. Matching Engine
cd apps/engine && bun run index.ts

# 2. DB Events Worker
cd apps/db-events && bun run index.ts

# 3. REST Backend
cd apps/backend && bun run index.ts

# 4. WebSocket Gateway
cd apps/ws && bun run index.ts

# 5. Web Frontend
cd apps/web && bun run dev
```

---

## Monorepo Commands

* **Build all**: `bun run build`
* **Type check all**: `bun run check-types`
* **Lint all**: `bun run lint`
* **Format code**: `bun run format`

---

## Detailed Documentation Directory

For complete guides, schemas, and specifications, explore [docs/](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/README.md):
* [Architecture & Request Lifecycle](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/architecture/SYSTEM_OVERVIEW.md)
* [REST API Reference](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/api/REST_API_REFERENCE.md)
* [WebSocket Protocol](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/api/WEBSOCKET_API.md)
* [Trading Lifecycle & Risk Engine](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/trading/TRADING_LIFECYCLE.md)
* [Redis Topology & Events](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/infrastructure/REDIS_ARCHITECTURE.md)
* [Database Schema & Models](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/infrastructure/DATABASE_SCHEMA.md)
* [Local Setup & Deployment](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/development/SETUP.md)
