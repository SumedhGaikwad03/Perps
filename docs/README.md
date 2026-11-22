# Perps Trading Platform: Technical Documentation

Welcome to the comprehensive technical documentation for the **Perps Trading Platform**, a high-performance, event-driven decentralized perpetual futures exchange built as a TypeScript monorepo powered by Bun, Turborepo, Express, Redis Streams, PostgreSQL (Prisma ORM), and React.

---

## Documentation Navigation

This documentation suite is organized into modular directories reflecting the platform architecture:

### 1. [Architecture](./architecture/SYSTEM_OVERVIEW.md)
* [System Overview](./architecture/SYSTEM_OVERVIEW.md): High-level system design, service boundaries, and data topology.
* [Monorepo Architecture](./architecture/MONOREPO_ARCHITECTURE.md): Turborepo workspace topology, dependencies, and build pipelines.
* [Application Flow](./architecture/APPLICATION_FLOW.md): Inter-service coordination between REST, Engine, DB Worker, and WS.
* [Request Lifecycle](./architecture/REQUEST_LIFECYCLE.md): End-to-end trace of HTTP and WebSocket requests through the stack.
* [System Diagrams](./architecture/SYSTEM_DIAGRAMS.md): Comprehensive Mermaid architecture, sequence, and entity diagrams.

### 2. [Applications](./applications/BACKEND.md)
* [Backend Service (`apps/backend`)](./applications/BACKEND.md): Express HTTP server, JWT auth, Redis stream loopback gateway.
* [Matching Engine (`apps/engine`)](./applications/MATCHING_ENGINE.md): In-memory L2 orderbook, risk engine, execution, and state hydration.
* [WebSocket Service (`apps/ws`)](./applications/WEBSOCKET_SERVICE.md): Bun native WebSocket server, channel multiplexing, and Redis Pub/Sub bridge.
* [DB Events Worker (`apps/db-events`)](./applications/DB_EVENTS_WORKER.md): Redis Stream consumer group worker for PostgreSQL persistence.
* [Web Frontend (`apps/web`)](./applications/WEB_FRONTEND.md): Vite + React + Tailwind trading terminal, Zustand stores, and TradingView charts.
* [Integration Test Suite (`apps/tests`)](./applications/TESTING.md): 24-suite Bun E2E testing harness and test execution protocols.
* [Documentation Portal (`apps/docs`)](./applications/DOCS_APPLICATION.md): Next.js documentation portal scaffold.

### 3. [API Documentation](./api/API_OVERVIEW.md)
* [API Overview](./api/API_OVERVIEW.md): Base URLs, headers, auth conventions, and status codes.
* [Complete REST API Reference](./api/REST_API_REFERENCE.md): Exhaustive breakdown of every mounted endpoint, request/response schemas, and controllers.
* [Authentication APIs](./api/AUTHENTICATION_APIS.md): User registration (`/signup`) and session acquisition (`/signin`).
* [Order APIs](./api/ORDER_APIS.md): Order placement (`/order`), cancellation (`/order/:orderId`), and position exits (`/exitPosition`).
* [Market APIs](./api/MARKET_APIS.md): Depth snapshots (`/market/depth`), 24h market stats (`/markets`), and admin provisioning (`/admin/market`).
* [Balance APIs](./api/BALANCE_APIS.md): Collateral deposits (`/onRamp`), withdrawals (`/offRamp`), and wallet queries (`/wallet`).
* [Position & Account APIs](./api/POSITION_APIS.md): Live engine state (`/live`), open orders (`/openOrders`), historical orders (`/orderHistory`), and positions (`/Positions`).
* [WebSocket API](./api/WEBSOCKET_API.md): Connection lifecycle, in-socket authentication, channel subscriptions, and event schemas.

### 4. [Trading System](./trading/TRADING_LIFECYCLE.md)
* [Trading Lifecycle](./trading/TRADING_LIFECYCLE.md): Complete lifecycle of an order from submission to matching and persistence.
* [Orderbook Data Structures](./trading/ORDERBOOK.md): Price-time priority `PriceLevel`, `Map`-based orderbook ladders, and FIFO queues.
* [Matching Engine](./trading/MATCHING_ENGINE.md): Limit and market execution logic, partial fills, self-trade prevention, and depth mirroring.
* [Risk Engine](./trading/RISK_ENGINE.md): Real-time margin validation, 1-second liquidation sweeps, and 1-hour funding rate settlements.
* [Margin and Leverage](./trading/MARGIN_AND_LEVERAGE.md): Formulas for initial margin, maintenance margin, unrealized PnL, and equity.
* [Position Management](./trading/POSITION_MANAGEMENT.md): Netting logic, position flipping, and average entry price calculation.
* [Order States](./trading/ORDER_STATES.md): Formal state transition diagram (`OPEN`, `PARTIALLY_FILLED`, `FILLED`, `CANCELLED`).

### 5. [Infrastructure](./infrastructure/REDIS_ARCHITECTURE.md)
* [Redis Architecture](./infrastructure/REDIS_ARCHITECTURE.md): Multi-role Redis deployment (Streams, Pub/Sub, In-Memory Hashes).
* [Redis Events](./infrastructure/REDIS_EVENTS.md): Event payload schemas for `engine`, `to-backend`, `db-events`, and Pub/Sub topics.
* [Database Architecture](./infrastructure/DATABASE_ARCHITECTURE.md): PostgreSQL schema, Prisma 7 Client with `@prisma/adapter-pg`.
* [Database Schema](./infrastructure/DATABASE_SCHEMA.md): Complete relational reference of `User`, `Market`, `Wallet`, `Position`, `Order`, and `Fill`.
* [Data Persistence](./infrastructure/DATA_PERSISTENCE.md): Dual-state write path: low-latency in-memory state vs. asynchronous PostgreSQL persistence.

### 6. [Shared Packages](./packages/COMMON_PACKAGE.md)
* [Common Package (`packages/common`)](./packages/COMMON_PACKAGE.md): Shared TypeScript domain interfaces, unions, and payload schemas.
* [Database Package (`packages/db`)](./packages/DATABASE_PACKAGE.md): Prisma configuration, adapter instantiation, and migration history.
* [Shared Contracts](./packages/SHARED_CONTRACTS.md): Inter-process contracts across the monorepo boundary.

### 7. [Development & Operations](./development/SETUP.md)
* [Local Setup Guide](./development/SETUP.md): Prerequisites, step-by-step local bootstrap, and service startup.
* [Environment Variables](./development/ENVIRONMENT_VARIABLES.md): Comprehensive reference template for `.env` configurations across all apps.
* [Development Workflow](./development/DEVELOPMENT_WORKFLOW.md): Day-to-day commands, type checking, and code formatting.
* [Build and Deployment](./development/BUILD_AND_DEPLOYMENT.md): Production builds via Turborepo and containerization guidance.
* [Testing Guide](./development/TESTING_GUIDE.md): Running unit and integration tests with Bun test runner.
* [Troubleshooting](./development/TROUBLESHOOTING.md): Known failure modes, Redis consumer group recreation, and recovery procedures.

### 8. [Reference Inventories](./reference/PROJECT_STRUCTURE.md)
* [Project Structure](./reference/PROJECT_STRUCTURE.md): Monorepo tree breakdown.
* [API Inventory](./reference/API_INVENTORY.md): Comprehensive tabular audit of every mounted route.
* [Event Inventory](./reference/EVENT_INVENTORY.md): Comprehensive inventory of Redis streams and Pub/Sub channels.
* [Database Inventory](./reference/DATABASE_INVENTORY.md): Database models, columns, types, indexes, and relations.
* [Technology Stack](./reference/TECHNOLOGY_STACK.md): Full breakdown of languages, frameworks, runtime engines, and third-party dependencies.
