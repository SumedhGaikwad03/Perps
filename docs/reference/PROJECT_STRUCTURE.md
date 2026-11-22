# Monorepo Project Structure

```
Perps/
├── package.json               # Monorepo root package definition
├── turbo.json                 # Turborepo task pipeline configuration
├── bun.lock                   # Bun lockfile
├── AGENTS.md                  # Turborepo agent guidance rule block
├── README.md                  # Canonical repository README
│
├── docs/                      # Production technical documentation
│   ├── README.md              # Master documentation index
│   ├── architecture/          # High-level architecture, diagrams, lifecycle
│   ├── applications/          # Deep-dive guides for each service
│   ├── api/                   # REST and WebSocket specifications
│   ├── trading/               # Orderbook, matching, and risk algorithms
│   ├── infrastructure/        # Redis, PostgreSQL, and event streaming
│   ├── packages/              # Shared TypeScript libraries
│   ├── development/           # Setup, workflows, and deployment
│   └── reference/             # Inventories, schemas, and technology stack
│
├── apps/
│   ├── backend/               # REST API HTTP Service (Express + Bun)
│   │   ├── index.ts           # Server bootstrap and route mounting
│   │   ├── loopback.ts        # Redis stream loopback pattern
│   │   ├── middleWare/        # JWT auth and Admin auth middlewares
│   │   ├── coreRoutes/        # Auth, Order, Market, Collateral routes
│   │   ├── userRoutes/        # Live, Wallet, Positions, OpenOrders routes
│   │   └── marketRoutes/      # Unmounted draft /markets route
│   │
│   ├── engine/                # Core In-Memory Matching & Risk Engine
│   │   ├── index.ts           # Service orchestrator and stream consumer
│   │   ├── src/config.ts      # Stream keys, intervals, token mappings
│   │   ├── src/types.ts       # Orderbook, Level, Position, Balance types
│   │   ├── src/bootstrap/     # State hydration from PostgreSQL
│   │   ├── src/market-data/   # Binance WebSocket continuous mark price feed
│   │   ├── src/matching-engine/# Price-time matching and fill execution
│   │   ├── src/orders/        # Command dispatchers (order, cancel, exit, ramp)
│   │   ├── src/positions/     # Position netting, flipping, and PnL
│   │   ├── src/risk/          # Margin formulas, 1s liquidation, 1h funding
│   │   ├── src/state/         # In-memory maps & Redis Hashes/PubSub mirrors
│   │   └── src/streams/       # Consumer loop and publisher wrappers
│   │
│   ├── ws/                    # WebSocket Streaming Gateway (Bun)
│   │   └── index.ts           # Server, Redis Pub/Sub multiplexer, depth cache
│   │
│   ├── db-events/             # Persistence Worker (Redis -> PostgreSQL)
│   │   └── index.ts           # Stream consumer & transactional Prisma persistence
│   │
│   ├── tests/                 # 24-Suite Integration Test Harness
│   │   ├── index.test.ts      # 3,275-line end-to-end integration tests
│   │   └── config.ts          # Backend test endpoint config
│   │
│   ├── web/                   # Vite + React Trading Terminal
│   │   ├── src/main.tsx       # React root
│   │   ├── src/App.tsx        # Main terminal shell
│   │   ├── src/components/    # Layout, charts, ladder, tape, tables, modals
│   │   ├── src/services/      # Axios API client & WebSocket manager
│   │   └── src/stores/        # Zustand stores (Auth, Market, User)
│   │
│   └── docs/                  # Next.js Documentation App Scaffold
│
└── packages/
    ├── common/                # Shared Types, Unions, and Event Contracts
    ├── db/                    # Prisma 7 Schema, Migrations, Adapter Client
    ├── eslint-config/         # Standardized ESLint presets
    ├── typescript-config/     # Standardized tsconfig compiler presets
    └── ui/                    # Shared React UI components (button, card, code)
```
