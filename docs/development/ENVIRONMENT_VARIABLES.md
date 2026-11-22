# Environment Variables Reference

This document provides templates and descriptions for all environment variables used across the Perps monorepo applications.

---

## 1. Centralized Variable Reference

| Variable | Applications | Purpose | Default / Example |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `packages/db`, `apps/engine`, `apps/backend`, `apps/db-events`, `apps/tests` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/perps_db` |
| `REDIS_URL` | `apps/backend`, `apps/engine`, `apps/ws`, `apps/db-events` | Redis connection endpoint | `redis://localhost:6379` |
| `JWT_SECRET` | `apps/backend`, `apps/ws` | Symmetric secret for signing & verifying trader session tokens | `your_secure_jwt_secret_here` |
| `ADMIN_SECRET` | `apps/backend`, `apps/tests` | Secret token guarding administrative market creation endpoints | `your_admin_secret_token_here` |
| `PORT` | `apps/backend` | REST API HTTP port | `3000` |
| `WS_PORT` | `apps/ws` | WebSocket gateway port | `3001` |
| `VITE_API_URL` | `apps/web` | REST API base URL for web client | `http://localhost:3000/api/v1` |
| `VITE_WS_URL` | `apps/web` | WebSocket server URL for web client | `ws://localhost:3001` |

---

## 2. `.env.example` Templates

### A. Root / Backend / Engine / DB-Events (`.env`)
```bash
# PostgreSQL Connection URL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/perps_db?schema=public"

# Redis Server URL
REDIS_URL="redis://localhost:6379"

# Security Secrets
JWT_SECRET="super_secret_jwt_key_change_me_in_prod"
ADMIN_SECRET="admin_secret_token_for_market_provisioning"

# Port Bindings
PORT=3000
WS_PORT=3001
```

### B. Frontend (`apps/web/.env`)
```bash
VITE_API_URL="http://localhost:3000/api/v1"
VITE_WS_URL="ws://localhost:3001"
```
