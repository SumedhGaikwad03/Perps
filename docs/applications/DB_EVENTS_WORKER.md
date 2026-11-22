# DB Events Worker (`apps/db-events`)

The **DB Events Worker** is a background consumer service dedicated to reading state-change events emitted by the matching engine and persisting them durably into PostgreSQL using Prisma ORM.

---

## 1. Responsibilities & Structure

### Core Responsibilities:
1. **Asynchronous Durability**: Removes all disk and database latency from the order-matching critical path by offloading persistence to an asynchronous worker.
2. **Consumer Group Ingestion**: Consumes from Redis stream `db-events` using consumer group `db-consumer-group` and worker name `db-worker-1`.
3. **Batch Processing**: Pulls up to 20 messages per batch (`COUNT: 20`) with a 2,000ms blocking timeout (`BLOCK: 2000`).
4. **Transactional Fill & Order Persistence**: Atomically creates `Fill` records and updates maker and taker order states within Prisma interactive transactions (`prisma.$transaction`).
5. **Position & Wallet Synchronization**: Upserts positions and wallet balances to ensure cold storage accurately matches in-memory engine state.
6. **Liquidation & Bankruptcy Cleanups**: Executes multi-table cleanups (zeroing position size, setting resting orders to `CANCELLED`) when accounts are liquidated.

### Source File Structure:
```
apps/db-events/
├── index.ts                           # Redis consumer loop, event dispatcher, transaction handlers
├── package.json                       # Dependencies (redis, db, common)
├── tsconfig.json                      # Bun TypeScript configuration
└── README.md                          # Application notes
```

---

## 2. Event Handlers & Persistence Logic

File: [apps/db-events/index.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/db-events/index.ts)

### 1. `TRADE_EXECUTED`
Persists the outcome of an order match across both maker and taker orders:
```typescript
await prisma.$transaction(async (tx) => {
  for (const fill of fills) {
    // 1. Create durable Fill record
    await tx.fill.create({
      data: {
        marketId,
        price: fill.price,
        qty: fill.qty,
        maker_id: fill.makerUserId,
        taker_id: takerUserId,
        maker_order_id: fill.makerOrderId,
        taker_order_id: takerOrderId,
      },
    });

    // 2. Increment maker filled quantity & update status
    const makerOrder = await tx.order.findUnique({ where: { id: fill.makerOrderId } });
    const updatedFilledQty = Number(makerOrder.filledQty) + parseFloat(fill.qty);
    const isFullfilled = updatedFilledQty >= Number(makerOrder.qty);
    await tx.order.update({
      where: { id: fill.makerOrderId },
      data: {
        filledQty: updatedFilledQty.toString(),
        status: isFullfilled ? "FILLED" : "PARTIALLY_FILLED",
      },
    });
  }

  // 3. Increment taker filled quantity & update status
  const takerOrder = await tx.order.findUnique({ where: { id: takerOrderId } });
  const updatedFilledQty = Number(takerOrder.filledQty) + totalTakerFillQty;
  const isFullfilled = updatedFilledQty >= Number(takerOrder.qty);
  await tx.order.update({
    where: { id: takerOrderId },
    data: {
      filledQty: updatedFilledQty.toString(),
      status: isFullfilled ? "FILLED" : "PARTIALLY_FILLED",
    },
  });
});
```

### 2. `ORDER_ACCEPTED`
Upserts a resting limit order in the database with status `OPEN`:
```typescript
await prisma.order.upsert({
  where: { id: orderId },
  update: {},
  create: {
    id: orderId,
    userId,
    marketId,
    orderType,
    orderSide,
    price,
    qty,
    timeInForce,
    reduceOnly,
    initialMargin,
    lockedMargin,
    status: "OPEN",
  },
});
```

### 3. `ORDER_CANCELLED`
Marks the target order as `CANCELLED`:
```typescript
await prisma.order.update({
  where: { id: orderId },
  data: { status: "CANCELLED" },
});
```

### 4. `POSITION_UPDATED`
Upserts the composite key `userId_marketId`:
```typescript
await prisma.position.upsert({
  where: { userId_marketId: { userId, marketId } },
  update: { size, entryPrice, leverage, liquidationPrice },
  create: { userId, marketId, size, entryPrice, leverage, liquidationPrice },
});
```

### 5. `WALLET_UPDATE`
Synchronizes available and locked balances:
```typescript
await prisma.wallet.upsert({
  where: { userId },
  update: { amountAvail: String(amountAvail), amountLocked: String(amountLocked) },
  create: { userId, amountAvail: String(amountAvail), amountLocked: String(amountLocked) },
});
```

### 6. `POSITION_LIQUIDATED` & `POSITION_BANKRUPT`
Zeroes out position size and cancels any remaining open orders in that market:
```typescript
await prisma.$transaction([
  prisma.position.updateMany({
    where: { userId, marketId },
    data: { size: "0", liquidationPrice: null },
  }),
  prisma.order.updateMany({
    where: { userId, marketId, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    data: { status: "CANCELLED" },
  }),
]);
```
