# Backend Service (`apps/backend`)

The **Backend Service** is an Express application running on Bun that acts as the primary HTTP REST gateway for the Perps Trading Platform.

For full architectural details, see [apps/backend Documentation](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/applications/BACKEND.md) and the [REST API Reference](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/api/REST_API_REFERENCE.md).

---

## Key Features

* **User Authentication**: Bun native password hashing (`Bun.password.hash`) and 8-hour JWT issuance.
* **Synchronous Stream Loopback**: Bridges HTTP requests to the matching engine using Redis Streams (`engine` $\to$ `to-backend`) via a correlated `loopbackId` with a 10-second timeout guard.
* **Low-Latency Depth Caching**: Serves orderbook snapshots directly from Redis Hashes (`market:<id>:depth`) without hitting the matching engine.
* **CORS Support**: Configured for cross-origin browser clients.

---

## API Routes Overview

* **Auth**:
  - `POST /api/v1/signup`: Register new account and wallet.
  - `POST /api/v1/signin`: Authenticate and obtain JWT.
* **Trading**:
  - `POST /api/v1/order`: Create Limit or Market order (authenticated).
  - `DELETE /api/v1/order/:orderId`: Cancel open limit order (authenticated).
  - `POST /api/v1/exitPosition`: Market exit position (authenticated).
* **Markets**:
  - `GET /api/v1/market/depth`: Fetch L2 orderbook snapshot (public).
  - `GET /api/v1/markets`: List all markets with 24h stats (public).
  - `POST /api/v1/admin/market`: Admin create new market (admin token required).
* **Collateral**:
  - `POST /api/v1/onRamp`: Deposit collateral into wallet (authenticated).
  - `POST /api/v1/offRamp`: Withdraw collateral from wallet (authenticated).
* **User State**:
  - `GET /api/v1/live` (or `/api/v1/user/live`): Fetch live balances, positions, and open orders from Redis.
  - `GET /api/v1/wallet` (or `/api/v1/user/wallet`): Fetch durable wallet from PostgreSQL.
  - `GET /api/v1/Positions` (or `/api/v1/user/Positions`): Fetch positions from PostgreSQL.
  - `GET /api/v1/openOrders` (or `/api/v1/user/openOrders`): Fetch open orders from Redis.
  - `GET /api/v1/orderHistory` (or `/api/v1/user/orderHistory`): Fetch historical closed orders from PostgreSQL.

---

## Running the Service

```bash
# Install dependencies
bun install

# Run backend service (Port 3000)
bun run index.ts

# Type check
bun run check-types
```
