# Complete Event and Topic Inventory

This document details all event topics, stream keys, and Redis channels in the Perps platform.

---

## 1. Redis Streams

| Stream Key | Consumer Group | Worker Name | Message Shape | Producer | Consumer |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`engine`** | `engine-consumer-group` | `engine-worker-1` | `{ loopbackId: string, payload: toEngine }` | `apps/backend` | `apps/engine` |
| **`to-backend`** | `backend-consumer-group` | `backend-instance-one` | `{ loopbackId: string, status: string, data?: string, error?: string }` | `apps/engine` | `apps/backend` |
| **`db-events`** | `db-consumer-group` | `db-worker-1` | `{ eventType: string, payload: string }` | `apps/engine` | `apps/db-events` |

---

## 2. Redis Pub/Sub Channels

| Channel Pattern | Payload Type | Purpose | Publisher | Subscriber |
| :--- | :--- | :--- | :--- | :--- |
| **`pub:depth:${marketId}`** | L2 Orderbook Depth Snapshot | Broadcasts updated top-50 bids/asks and last traded price | `apps/engine` | `apps/ws` |
| **`pub:depth:${symbol}`** | L2 Orderbook Depth Snapshot | Symbol-aliased depth broadcast (e.g. `pub:depth:BTC_USDC`) | `apps/engine` | `apps/ws` |
| **`pub:trades:${marketId}`** | Execution Fill Array | Broadcasts public trade prints to trade tape | `apps/engine` | `apps/ws` |
| **`pub:trades:${symbol}`** | Execution Fill Array | Symbol-aliased trade broadcast (e.g. `pub:trades:BTC_USDC`) | `apps/engine` | `apps/ws` |
| **`pub:user:${userId}`** | Private Notification Object | Streams private account updates (fills, balance updates, order cancels) | `apps/engine` | `apps/ws` (via `pSubscribe("pub:user:*")`) |

---

## 3. Redis In-Memory Hashes

| Key Pattern | Field | Value Format | Purpose |
| :--- | :--- | :--- | :--- |
| **`market:${marketId}:depth`** | `"data"` | JSON depth snapshot | Low-latency orderbook cache for REST and WS replay |
| **`market:${symbol}:depth`** | `"data"` | JSON depth snapshot | Symbol-aliased depth cache |
| **`user:${userId}:balances`** | `"data"` | JSON `{ available_bal, locked_bal }` | Fast balance cache for REST `/live` |
| **`user:${userId}:positions`** | `${marketId}` | JSON Position object | Active position cache for REST `/live` |
| **`user:${userId}:open_orders`**| `${orderId}` | JSON OpenOrder object | Resting orders cache for REST `/live` and `/openOrders` |
