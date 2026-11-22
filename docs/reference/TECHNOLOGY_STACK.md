# Technology Stack and Dependency Specifications

---

## 1. Core Runtime & Language

* **Language**: TypeScript 5.8 / 7.0 (Strict mode enabled across all packages).
* **Runtime**: [Bun v1.4.3](https://bun.com) (Used for package management, script execution, native password hashing, native WebSockets, and testing).
* **Monorepo Engine**: [Turborepo v2.11.9](https://turborepo.dev).

---

## 2. Infrastructure & Persistence

* **Database Engine**: PostgreSQL 16.
* **ORM & Database Tooling**: Prisma ORM v7 with `@prisma/adapter-pg` driver adapter.
* **Message Bus & Memory Cache**: Redis 7 (Redis Streams, Consumer Groups, Pub/Sub, Hashes).
* **Database Driver**: `pg` (Node Postgres client for connection pooling).

---

## 3. Backend & Gateway Frameworks

* **REST Framework**: Express v5 (`express@^5.1.0`).
* **Security & Tokens**: `jsonwebtoken` (v9.0.2), `cors` (v2.8.5).
* **Redis Client**: `redis` (v5.1.0) with support for Redis Streams (`xAdd`, `xReadGroup`, `xAck`, `xGroupCreate`).
* **WebSocket Server**: Bun native `Bun.serve` WebSocket engine with per-socket subscriptions and readyState management.

---

## 4. Frontend Terminal Architecture

* **UI Framework**: React 19 (`react@^19.0.0`, `react-dom@^19.0.0`).
* **Build Tool**: Vite (`vite@^6.0.0`).
* **Styling**: Tailwind CSS (`tailwindcss@^3.4.0`), PostCSS, Autoprefixer.
* **Icons**: Lucide React (`lucide-react@^1.16.0`).
* **State Management**: Zustand (`zustand@^5.0.0`).
* **Financial Charting**: TradingView Lightweight Charts (`lightweight-charts@^5.0.0`).
* **HTTP Client**: Axios (`axios@^1.7.0`).

---

## 5. Testing & Quality Assurance

* **Test Runner**: Bun native test runner (`bun:test`).
* **Linters**: Biome (`@biomejs/biome@2.6.5`), ESLint (`eslint@^9.0.0`).
* **Formatters**: Prettier (`prettier@3.9.6`).
