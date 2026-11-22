# Application Flow and Inter-Service Coordination

This document details how the microservices in the Perps platform interact across Redis streams, Pub/Sub channels, in-memory caches, and PostgreSQL.

---

## 1. Inter-Service Communication Topology

The platform coordinates four backend processes and client-facing interfaces:

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser / Client
    participant Web as apps/web (Frontend)
    participant Backend as apps/backend (REST)
    participant Redis as Redis (Streams & Hashes)
    participant Engine as apps/engine (Matching)
    participant DBWorker as apps/db-events (Persistence)
    participant Postgres as PostgreSQL Database
    participant WS as apps/ws (WebSocket Gateway)

    Note over User,WS: 1. Authentication & Session Initialization
    User->>Backend: POST /api/v1/signup / POST /api/v1/signin
    Backend->>Postgres: Verify / Create User & Wallet
    Backend-->>User: Return JWT { userId }
    User->>WS: Connect ws://localhost:3001?token=JWT
    WS-->>User: { type: "connected" }

    Note over User,WS: 2. Channel Subscriptions & Depth Hydration
    User->>WS: { action: "subscribe", channels: ["depth:BTC_USDC", "trades:BTC_USDC"] }
    WS->>Redis: hGet market:BTC_USDC:depth data
    Redis-->>WS: Return cached depth snapshot
    WS-->>User: Immediate depth snapshot frame
    WS->>Redis: subscribe pub:depth:BTC_USDC, pub:trades:BTC_USDC

    Note over User,Engine: 3. Order Placement & Loopback Matching
    User->>Backend: POST /api/v1/order { marketId, side, qty, price, leverage, orderType }
    Backend->>Backend: Validate format & extract userId from JWT
    Backend->>Redis: xAdd 'engine' { loopbackId, payload }
    Backend->>Backend: Register pending Promise in loopBackResolves map (10s timeout)
    Redis->>Engine: xReadGroup from 'engine' (Consumer: engine-worker-1)
    Engine->>Engine: Validate Margin & Match Order against in-memory OrderBook
    
    Note over Engine,WS: 4. Real-time Broadcasting & State Mirroring
    Engine->>Redis: hSet market:BTC_USDC:depth (Updated L2 ladder)
    Engine->>Redis: hSet user:UID:open_orders (Mirrored open orders)
    Engine->>Redis: publish pub:depth:BTC_USDC & pub:trades:BTC_USDC
    Engine->>Redis: publish pub:user:UID (User execution report)
    Redis-->>WS: Deliver Pub/Sub frames
    WS-->>User: Broadcast updated depth, trades, and user balance/order update

    Note over Engine,Backend: 5. Loopback Resolution
    Engine->>Redis: xAdd 'to-backend' { loopbackId, status: "SUCCESS", data }
    Engine->>Redis: xAck 'engine' entry.id
    Redis->>Backend: xReadGroup from 'to-backend' (Consumer: backend-instance-one)
    Backend->>Backend: Resolve deferred Promise for loopbackId
    Backend->>Redis: xAck 'to-backend' entry.id
    Backend-->>User: HTTP 200 { orderId, message, result }

    Note over Engine,Postgres: 6. Asynchronous Persistence Path
    Engine->>Redis: xAdd 'db-events' { eventType: "TRADE_EXECUTED", payload }
    Redis->>DBWorker: xReadGroup from 'db-events' (Consumer: db-worker-1)
    DBWorker->>Postgres: $transaction (Insert Fill, Update Order filledQty/status)
    DBWorker->>Redis: xAck 'db-events' entry.id
```

---

## 2. Service Startup Sequence

To ensure seamless coordination and prevent missing dependencies, services must start in the following strict order:

### Step 1: Infrastructure Layer
1. **PostgreSQL**: Must be running, accepting connections on port 5432 with active schema migrations applied via `bun run --filter db prisma:migrate`.
2. **Redis**: Must be running, accepting connections on port 6379.

### Step 2: Engine Boot & Hydration Layer (`apps/engine`)
* Connects to Redis and initializes consumer group `engine-consumer-group` on stream `engine`.
* Executes `bootstrapEngine()`:
  - Queries `prisma.market.findMany()` $\to$ registers in-memory orderbooks.
  - Queries `prisma.wallet.findMany()` $\to$ hydrates in-memory balances.
  - Queries `prisma.position.findMany()` $\to$ hydrates open positions.
  - Queries `prisma.order.findMany({ where: { status: { in: ["OPEN", "PARTIALLY_FILLED"] } } })` $\to$ inserts resting orders into orderbooks and mirrors to Redis Hashes.
* Spawns background daemons:
  - `startLiquidationPoller()`: Runs every 1,000ms.
  - `startFundingRatePoller()`: Runs every 1 hour (3,600,000ms).
  - `startBinanceWebSocket()`: Initiates persistent WebSocket connection to Binance futures for mark prices.
* Begins infinite `xReadGroup` loop on stream `engine`.

### Step 3: Persistence Layer (`apps/db-events`)
* Connects to Redis and registers consumer group `db-consumer-group` on stream `db-events`.
* Begins polling stream `db-events` with a 2,000ms block interval and batch size of 20 messages.

### Step 4: Gateways (`apps/backend` and `apps/ws`)
* **`apps/backend`**:
  - Connects to Redis and initializes consumer group `backend-consumer-group` on stream `to-backend`.
  - Spawns background consumer loop for resolving loopback promises.
  - Binds HTTP server to port 3000.
* **`apps/ws`**:
  - Connects to Redis Pub/Sub client and reader client.
  - Subscribes to pattern `pub:user:*`.
  - Binds WebSocket gateway to port 3001.

### Step 5: Presentation Layer (`apps/web`)
* Vite development server binds to port 5173.
* Establishes initial REST queries for markets and connects to WebSocket on port 3001.
