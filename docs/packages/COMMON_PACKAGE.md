# Common Package (`packages/common`)

File: [packages/common/index.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/common/index.ts)

The `packages/common` package is an internal TypeScript library housing the shared domain models, union types, and message contracts across all applications in the monorepo.

---

## 1. Type Definitions Summary

### 1. Primitive Domain Types
```typescript
export type orderSide = "BID" | "ASK";
export type TimeInForce = "GTC" | "FOK" | "IOC";
export type OrderType = "LIMIT" | "MARKET";

export const SUPPORTED_BASE_TOKEN = ["BTC", "SOL", "ETH"] as const;
export type BaseToken = typeof SUPPORTED_BASE_TOKEN[number];
```

### 2. Matching Engine Command Union (`toEngine`)
Encapsulates all instructions dispatched from `apps/backend` to `apps/engine`:
* `ON_RAMP`: `{ userId, amount }`
* `OFF_RAMP`: `{ userId, amount }`
* `CREATE_ORDER`: `{ userId, orderId, marketId, qty, price?, orderType, leverage, timeInForce, side, reduceOnly }`
* `CANCEL_ORDER`: `{ userId, orderId, marketId, side }`
* `EXIT_POSITION`: `{ marketId, qty, orderId, userId }`
* `CREATE_MARKET`: `{ marketId, imgUrl?, slug, baseToken, symbol, tickSize, stepSize }`
* `MODIFY_ORDER`: `{ userId, marketId, orderId, reduceOnly, side }`

### 3. Persistence Event Union (`DbEventMessage`)
Discriminated union mapping event types to strongly typed payloads:
```typescript
export interface DbEventPayloadMap {
  TRADE_EXECUTED: TradeExecutedPayload;
  ORDER_CANCELLED: OrderCancelledPayload;
  POSITION_LIQUIDATED: PositionLiquidatedPayload;
  POSITION_BANKRUPT: PositionBankruptPayload;
  MARKET_CREATED: MarketCreatedPayload;
  ORDER_ACCEPTED: OrderAcceptedPayload;
  POSITION_UPDATED: PositionUpdatePayload;
  WALLET_UPDATE: WalletTransactionPayload;
}

export type dbEvent = keyof DbEventPayloadMap;
```

### 4. Engine Response & State Mirror Contracts
* `EngineResponsePayload`: `{ loopbackId, status: "SUCCESS" | "REJECTED" | "ERROR", data?, error? }`
* `MirrorOpenOrder`: `{ orderId, userId, marketId, price, qty, filledQty, orderSide, orderType, reduceOnly }`
* `Tradefill`: `{ price, qty, makerUserId, makerOrderId, makerUserLeverage }`
* `OrderResult`: `{ marketId, orderId, status, executedQty, remainingQty, fills }`

---

## 2. Package Usage Across Monorepo

| Application / Package | Imports from `common` | Purpose |
| :--- | :--- | :--- |
| `apps/backend` | `toEngine`, `orderSide`, `OrderType` | Constructing validated engine messages. |
| `apps/engine` | `toEngine`, `DbEventPayloadMap`, `MirrorOpenOrder` | Consuming commands and emitting typed events. |
| `apps/db-events` | `DbEventPayloadMap`, `Payloads.*` | Strongly typed handlers for PostgreSQL persistence. |
| `apps/tests` | `toEngine`, `OrderResult` | Constructing test payloads and verifying assertions. |
| `apps/web` | `orderSide`, `OrderType`, `BaseToken` | Typing frontend order placement forms. |
