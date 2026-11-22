# DB Events Worker (`apps/db-events`)

The **DB Events Worker** is an asynchronous background consumer that ingests trading and state-change events emitted by the matching engine and persists them durably into PostgreSQL using Prisma ORM.

For complete persistence patterns, see [apps/db-events Documentation](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/applications/DB_EVENTS_WORKER.md) and [Data Persistence](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/infrastructure/DATA_PERSISTENCE.md).

---

## Key Features

* **Decoupled Durability**: Completely removes PostgreSQL database latency from the matching engine execution loop.
* **Stream Ingestion**: Consumes from Redis stream `db-events` using consumer group `db-consumer-group`.
* **Atomic Batching**: Pulls batches of up to 20 messages every 2,000ms.
* **Transactional Operations**: Persists trade fills and maker/taker order state updates within interactive Prisma transactions (`prisma.$transaction`).
* **Supported Events**:
  - `TRADE_EXECUTED`: Creates `Fill` rows, updates maker and taker order `filledQty` and `status`.
  - `ORDER_ACCEPTED`: Inserts new resting limit orders (`status: "OPEN"`).
  - `ORDER_CANCELLED`: Marks orders as `CANCELLED`.
  - `POSITION_UPDATED`: Upserts user positions (`size`, `entryPrice`, `leverage`).
  - `WALLET_UPDATE`: Upserts user wallet balances (`amountAvail`, `amountLocked`).
  - `POSITION_LIQUIDATED` & `POSITION_BANKRUPT`: Zeroes position size and cancels remaining open orders.
  - `MARKET_CREATED`: Upserts market parameters.

---

## Running the Worker

```bash
# Install dependencies
bun install

# Run worker daemon
bun run index.ts

# Type check
bun run check-types
```
