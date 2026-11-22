# Complete Trading Lifecycle

This document provides a comprehensive end-to-end trace of an order from the user's browser, through input validation, Redis streams, risk checks, matching engine execution, real-time WebSocket distribution, and asynchronous PostgreSQL persistence.

---

## 1. End-to-End Execution Trace

```mermaid
sequenceDiagram
    autonumber
    actor Trader as Trader (apps/web)
    participant REST as apps/backend (HTTP Gateway)
    participant RedisStreams as Redis Streams ('engine')
    participant Engine as apps/engine (Matching & Risk)
    participant RedisMirror as Redis Hashes & Pub/Sub
    participant WS as apps/ws (WebSocket Gateway)
    participant DBStream as Redis Stream ('db-events')
    participant DBWorker as apps/db-events (Persistence)
    participant Postgres as PostgreSQL (Prisma)

    Trader->>REST: POST /api/v1/order { marketId, side: "BID", qty: "0.5", price: "90000", leverage: 10 }
    Note over REST: 1. Validate JWT token<br/>2. Validate format (finite, > 0)<br/>3. Generate UUIDv7 orderId<br/>4. Generate UUIDv7 loopbackId
    REST->>RedisStreams: xAdd 'engine' { loopbackId, payload }
    REST->>REST: Arm 10,000ms loopback timer
    
    RedisStreams->>Engine: xReadGroup from 'engine'
    Note over Engine: 1. Fetch OrderBook by marketId<br/>2. Calculate required initial margin:<br/>(0.5 * 90000) / 10 = $4,500<br/>3. Check user available balance >= $4,500<br/>4. Deduct $4,500 from available_bal
    
    alt Order matches resting Ask at 90,000
        Note over Engine: Match execution against resting maker order:<br/>- Calculate fill: 0.5 BTC at $90,000<br/>- Maker filledQty updated to 0.5<br/>- Taker filledQty updated to 0.5<br/>- Update taker position: +0.5 BTC (LONG)<br/>- Update maker position: -0.5 BTC (SHORT)<br/>- Settle realized PnL if closing
        Engine->>DBStream: xAdd 'db-events' { eventType: "TRADE_EXECUTED", payload }
        Engine->>RedisMirror: publish pub:trades:BTC_USDC
        Engine->>RedisMirror: hSet user:UID:positions
        Engine->>RedisMirror: hSet user:UID:balances
        Engine->>RedisMirror: publish pub:user:UID
    else No crossing Ask exists (Resting Limit Order)
        Note over Engine: Insert into Orderbook:<br/>- Add order to PriceLevel for 90,000<br/>- Recompute PriceLevel.totalQty<br/>- Order status set to OPEN<br/>- Balance locked_bal += $4,500
        Engine->>DBStream: xAdd 'db-events' { eventType: "ORDER_ACCEPTED", payload }
        Engine->>RedisMirror: hSet user:UID:open_orders
        Engine->>RedisMirror: hSet user:UID:balances
        Engine->>RedisMirror: publish pub:user:UID
    end

    Note over Engine: Update L2 depth snapshot
    Engine->>RedisMirror: hSet market:BTC_USDC:depth
    Engine->>RedisMirror: publish pub:depth:BTC_USDC
    
    Engine->>REST: xAdd 'to-backend' { loopbackId, status: "SUCCESS", data }
    Engine->>RedisStreams: xAck 'engine'
    
    REST->>Trader: HTTP 200 { orderId, message, result }
    
    RedisMirror->>WS: pub:depth:BTC_USDC & pub:user:UID
    WS->>Trader: Push updated Orderbook Ladder & Position/Balance
    
    DBStream->>DBWorker: xReadGroup from 'db-events'
    DBWorker->>Postgres: Execute Prisma transaction (Fills, Orders, Wallets)
    DBWorker->>DBStream: xAck 'db-events'
```

---

## 2. Order Placement Modes

### 1. Limit Order Placement (`orderType: "LIMIT"`)
* **Price Obligation**: Must supply a valid finite `price > 0`.
* **Execution**:
  - The engine first attempts to match against the opposing book at prices equal to or better than `price`.
  - If unfilled quantity remains (`remainingQty > 0`), the unfilled portion is inserted into the orderbook at `price`.
  - The margin required for the resting portion is locked in the user's wallet (`locked_bal += requiredMargin`).
  - The order is mirrored to Redis Hash `user:${userId}:open_orders`.

### 2. Market Order Placement (`orderType: "MARKET"`)
* **Price Behavior**: The limit `price` is optional (or omitted).
* **Execution**:
  - The engine aggressively sweeps through the opposing orderbook ladder, starting from the best bid/ask, until the requested `qty` is exhausted or available depth is depleted.
  - If the opposing book is exhausted before `qty` is fulfilled, the remaining unfilled quantity is **cancelled** (does not rest in the book).
  - Margin is validated against the best available book price or the latest traded price.

---

## 3. Order Cancellation Lifecycle

1. Trader initiates cancellation via UI or `DELETE /api/v1/order/:orderId`.
2. Backend pushes `CANCEL_ORDER` into Redis stream `engine`.
3. Matching engine locates the order in `book.bids` or `book.asks`.
4. Calculates unfulfilled margin (`(qty - filledQty) * price / leverage`).
5. Releases margin back to the user:
   - `locked_bal -= unfulfilledMargin`
   - `available_bal += unfulfilledMargin`
6. Removes order from the `PriceLevel.orders` array and updates `totalQty`.
7. Deletes from Redis Hash `user:${userId}:open_orders` via `hDel`.
8. Emits `ORDER_CANCELLED` to `db-events` $\to$ `apps/db-events` updates PostgreSQL status to `CANCELLED`.
9. Publishes cancellation update to `pub:user:${userId}` and updated depth to `pub:depth:${marketId}`.
