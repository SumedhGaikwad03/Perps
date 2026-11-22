# Database Schema Reference

File: [packages/db/prisma/schema.prisma](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/db/prisma/schema.prisma)

This document provides a field-by-field reference of all models, enums, indexes, and constraints in the PostgreSQL database.

---

## 1. Enums

### `OrderStatus`
* `OPEN`: Resting order in the book with 0 executed quantity.
* `PARTIALLY_FILLED`: Order has executed partial fills; remaining quantity rests in book.
* `FILLED`: Order has executed 100% of quantity (terminal).
* `CANCELLED`: Unfilled portion cancelled by user, FOK, or liquidation (terminal).

### `OrderSide`
* `BID`: Long / Buy order.
* `ASK`: Short / Sell order.

### `OrderType`
* `LIMIT`: Restricts execution to specified price or better.
* `MARKET`: Executes immediately at the best available opposing prices.

### `TimeInForce`
* `GTC` (Good 'Til Cancelled): Order remains in book until filled or cancelled.
* `FOK` (Fill Or Kill): Entire order must fill immediately or be cancelled entirely.
* `IOC` (Immediate Or Cancel): Executes immediately; unfilled portion cancelled.

---

## 2. Models

### 1. `User`
Represents an authenticated trader account.
* `id` (`String`, `@id`, `@default(uuid())`): Primary key.
* `username` (`String`, `@unique`): Unique login identifier.
* `password` (`String`): Bun cryptographically hashed password.
* `createdAt` (`DateTime`, `@default(now())`)
* `updatedAt` (`DateTime`, `@updatedAt`)
* **Relations**: `wallet` (1-to-1 `Wallet`), `positions` (1-to-many `Position`), `orders` (1-to-many `Order`), `maker_fills` (1-to-many `Fill`), `taker_fills` (1-to-many `Fill`).

### 2. `Market`
Represents a tradable perpetual futures derivative contract.
* `id` (`String`, `@id`, `@default(uuid())`): Primary key.
* `symbol` (`String`, `@unique`): Ticker pair (e.g. `BTC_USDC`).
* `slug` (`String`, `@unique`): URL slug (e.g. `btc-usdc`).
* `imgUrl` (`String?`): Icon URL.
* `baseToken` (`String`): Underlying token (`BTC`, `ETH`, `SOL`).
* `tickSize` (`String`, `@default("0.1")`): Minimum price tick.
* `stepSize` (`String`, `@default("0.001")`): Minimum size increment.
* `createdAt` (`DateTime`, `@default(now())`)
* `updatedAt` (`DateTime`, `@updatedAt`)
* **Relations**: `orders` (1-to-many `Order`), `positions` (1-to-many `Position`), `fills` (1-to-many `Fill`).

### 3. `Wallet`
Represents trader collateral balances.
* `id` (`String`, `@id`, `@default(uuid())`): Primary key.
* `userId` (`String`, `@unique`): Foreign key referencing `User.id`.
* `amountAvail` (`String`, `@default("0")`): Available unencumbered quote margin.
* `amountLocked` (`String`, `@default("0")`): Margin locked in resting orders and active positions.
* `createdAt` (`DateTime`, `@default(now())`)
* `updatedAt` (`DateTime`, `@updatedAt`)

### 4. `Position`
Represents directional perpetual contract holdings.
* `id` (`String`, `@id`, `@default(uuid())`): Primary key.
* `userId` (`String`): Foreign key referencing `User.id`.
* `marketId` (`String`): Foreign key referencing `Market.id`.
* `size` (`String`, `@default("0")`): Signed size (`> 0` Long, `< 0` Short).
* `entryPrice` (`String`, `@default("0")`): Weighted average entry price.
* `leverage` (`Int`, `@default(0)`): Position leverage multiplier.
* `liquidationPrice` (`String?`): Calculated liquidation mark price.
* `createdAt` (`DateTime`, `@default(now())`)
* `updatedAt` (`DateTime`, `@updatedAt`)
* **Constraints**: `@@unique([userId, marketId])` ensures one position per market per user.

### 5. `Order`
Represents submitted trading orders.
* `id` (`String`, `@id`, `@default(uuid())`): Primary key (UUIDv7).
* `userId` (`String`): Foreign key referencing `User.id`.
* `marketId` (`String`): Foreign key referencing `Market.id`.
* `orderType` (`OrderType`): `LIMIT` or `MARKET`.
* `orderSide` (`OrderSide`): `BID` or `ASK`.
* `price` (`String?`): Limit execution price.
* `slippage` (`Int?`): Max slippage bps (if applicable).
* `qty` (`String`): Total order size.
* `filledQty` (`String`, `@default("0")`): Cumulative executed quantity.
* `initialMargin` (`String`, `@default("0")`): Margin commitment.
* `lockedMargin` (`String`, `@default("0")`): Active locked collateral.
* `status` (`OrderStatus`, `@default(OPEN)`): Current order status.
* `timeInForce` (`TimeInForce`): `GTC`, `FOK`, `IOC`.
* `reduceOnly` (`Boolean`, `@default(false)`): Position-reducing flag.
* `createdAt` (`DateTime`, `@default(now())`)
* `updatedAt` (`DateTime`, `@updatedAt`)
* **Indexes**:
  - `@@index([userId])` for fast order history queries.
  - `@@index([marketId, status])` for efficient state hydration on boot.

### 6. `Fill`
Represents an executed trade match between a maker and taker.
* `id` (`String`, `@id`, `@default(uuid())`): Primary key.
* `marketId` (`String`): Foreign key referencing `Market.id`.
* `price` (`String`): Execution price.
* `qty` (`String`): Executed quantity.
* `maker_id` (`String`): Foreign key referencing `User.id`.
* `taker_id` (`String`): Foreign key referencing `User.id`.
* `maker_order_id` (`String`): Foreign key referencing `Order.id`.
* `taker_order_id` (`String`): Foreign key referencing `Order.id`.
* `makerFee` (`String`, `@default("0")`): Maker fee rebate.
* `takerFee` (`String`, `@default("0")`): Taker fee charged.
* `createdAt` (`DateTime`, `@default(now())`)
* **Indexes**:
  - `@@index([marketId, createdAt])` for 24h market stats and volume rollups.
  - `@@index([maker_id])` and `@@index([taker_id])` for user trade history.
