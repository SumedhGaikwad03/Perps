# Complete Database Model Inventory

File: [packages/db/prisma/schema.prisma](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/db/prisma/schema.prisma)

---

## 1. Relational Table Summary

| Table Name | Model Name | Primary Key | Unique Constraints | Foreign Keys | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`User`** | `User` | `id` (UUID) | `username` | — | Trader account credentials and profile |
| **`Market`** | `Market` | `id` (UUID) | `symbol`, `slug` | — | Derivative market specifications and tokens |
| **`Wallet`** | `Wallet` | `id` (UUID) | `userId` | `userId` $\to$ `User.id` | Margin balances (available and locked) |
| **`Position`** | `Position` | `id` (UUID) | `[userId, marketId]` | `userId` $\to$ `User.id`<br/>`marketId` $\to$ `Market.id` | Directional perpetual contract holdings |
| **`Order`** | `Order` | `id` (UUIDv7)| — | `userId` $\to$ `User.id`<br/>`marketId` $\to$ `Market.id` | Submitted Limit and Market orders |
| **`Fill`** | `Fill` | `id` (UUID) | — | `marketId` $\to$ `Market.id`<br/>`maker_id` $\to$ `User.id`<br/>`taker_id` $\to$ `User.id`<br/>`maker_order_id` $\to$ `Order.id`<br/>`taker_order_id` $\to$ `Order.id` | Immutable trade execution ledger |

---

## 2. Table Column Specifications

### Table: `User`
* `id` (`String` / `uuid`): PK
* `username` (`String`): UK
* `password` (`String`): Password hash
* `createdAt` (`DateTime`): Timestamp
* `updatedAt` (`DateTime`): Timestamp

### Table: `Market`
* `id` (`String` / `uuid`): PK
* `symbol` (`String`): UK (e.g. `BTC_USDC`)
* `slug` (`String`): UK (e.g. `btc-usdc`)
* `imgUrl` (`String?`): Nullable icon URI
* `baseToken` (`String`): Asset ticker (`BTC`, `SOL`, `ETH`)
* `tickSize` (`String`, default `"0.1"`): Price tick size
* `stepSize` (`String`, default `"0.001"`): Quantity step size
* `createdAt` (`DateTime`): Timestamp
* `updatedAt` (`DateTime`): Timestamp

### Table: `Wallet`
* `id` (`String` / `uuid`): PK
* `userId` (`String`): FK, UK
* `amountAvail` (`String`, default `"0"`): Available margin
* `amountLocked` (`String`, default `"0"`): Locked margin
* `createdAt` (`DateTime`): Timestamp
* `updatedAt` (`DateTime`): Timestamp

### Table: `Position`
* `id` (`String` / `uuid`): PK
* `userId` (`String`): FK
* `marketId` (`String`): FK
* `size` (`String`, default `"0"`): Directional size
* `entryPrice` (`String`, default `"0"`): Average entry price
* `leverage` (`Int`, default `0`): Leverage multiplier
* `liquidationPrice` (`String?`): Liquidation price mark
* `createdAt` (`DateTime`): Timestamp
* `updatedAt` (`DateTime`): Timestamp
* **Constraint**: `@@unique([userId, marketId])`

### Table: `Order`
* `id` (`String` / `uuid`): PK
* `userId` (`String`): FK
* `marketId` (`String`): FK
* `orderType` (`OrderType` enum): `LIMIT`, `MARKET`
* `orderSide` (`OrderSide` enum): `BID`, `ASK`
* `price` (`String?`): Limit price
* `slippage` (`Int?`): Slippage bps
* `qty` (`String`): Total size
* `filledQty` (`String`, default `"0"`): Cumulative fill
* `initialMargin` (`String`, default `"0"`): Initial margin
* `lockedMargin` (`String`, default `"0"`): Locked margin
* `status` (`OrderStatus` enum, default `OPEN`): `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `CANCELLED`
* `timeInForce` (`TimeInForce` enum): `GTC`, `FOK`, `IOC`
* `reduceOnly` (`Boolean`, default `false`): Reduce-only flag
* `createdAt` (`DateTime`): Timestamp
* `updatedAt` (`DateTime`): Timestamp
* **Indexes**: `@@index([userId])`, `@@index([marketId, status])`

### Table: `Fill`
* `id` (`String` / `uuid`): PK
* `marketId` (`String`): FK
* `price` (`String`): Execution price
* `qty` (`String`): Match quantity
* `maker_id` (`String`): FK to User
* `taker_id` (`String`): FK to User
* `maker_order_id` (`String`): FK to Order
* `taker_order_id` (`String`): FK to Order
* `makerFee` (`String`, default `"0"`): Maker fee
* `takerFee` (`String`, default `"0"`): Taker fee
* `createdAt` (`DateTime`): Timestamp
* **Indexes**: `@@index([marketId, createdAt])`, `@@index([maker_id])`, `@@index([taker_id])`
