# Troubleshooting and Common Failure Modes

This document provides diagnosis and resolution procedures for common issues encountered during development and operations.

---

## 1. Redis Consumer Group Failures (`NOGROUP` / `BUSYGROUP`)

### Symptom:
Console log displays:
`[Engine Consumer Error]: NOGROUP No such key 'engine' or consumer group 'engine-consumer-group'`
Or:
`[Backend Consumer Error]: NOGROUP No such key 'to-backend'`

### Root Cause:
Occurs if Redis was restarted, flushed (`FLUSHALL`), or if consumer loops attempted to read from streams before the stream keys or consumer groups were initialized.

### Resolution:
All consumer loops in `apps/backend/loopback.ts`, `apps/engine/src/streams/consumer.ts`, and `apps/db-events/index.ts` include automatic `NOGROUP` error recovery logic that catches this error and automatically calls `xGroupCreate(..., { MKSTREAM: true })`. If manual recreation is required via CLI:
```bash
redis-cli XGROUP CREATE engine engine-consumer-group 0 MKSTREAM
redis-cli XGROUP CREATE to-backend backend-consumer-group 0 MKSTREAM
redis-cli XGROUP CREATE db-events db-consumer-group 0 MKSTREAM
```

---

## 2. Order Rejection: `INSUFFICIENT_BALANCE`

### Symptom:
`POST /api/v1/order` returns HTTP 400 with `{ "message": "INSUFFICIENT_BALANCE" }`.

### Root Cause:
The trader's `available_bal` in the matching engine is less than the required Initial Margin:
$$\text{RequiredMargin} = \frac{\text{Qty} \times \text{Price}}{\text{Leverage}}$$

### Resolution:
1. Ensure the user has deposited quote collateral using `POST /api/v1/onRamp` with sufficient USDC.
2. Check if margin is tied up in other resting limit orders (`locked_bal`). Cancelling resting limit orders releases `locked_bal` back to `available_bal`.
3. Increase leverage (e.g. from 1x to 10x or 20x) to reduce initial margin requirements.

---

## 3. Order Rejection: `Invalid price value`

### Symptom:
Frontend displays `"Invalid price value"` when placing a Market order.

### Root Cause:
In an illiquid market with an empty orderbook, a Market order has no resting maker prices to evaluate against and `lastTradedPrice` may be 0. 

### Resolution:
1. Ensure at least one resting limit order (Ask for Buy Market, Bid for Sell Market) is resting in the orderbook to establish liquidity.
2. Ensure the Binance WebSocket feed is connected and setting a valid oracle mark price in memory.

---

## 4. Port Conflict on Port 3000

### Symptom:
`apps/backend` or `apps/docs` fails with `EADDRINUSE: address already in use 0.0.0.0:3000`.

### Root Cause:
Both `apps/backend` and `apps/docs` default to port 3000 in standard Next.js / Bun environments.

### Resolution:
* `apps/backend` runs on port 3000 by default.
* If running `apps/docs` simultaneously, specify an alternate port:
  ```bash
  cd apps/docs
  bun dev --port 3002
  ```
