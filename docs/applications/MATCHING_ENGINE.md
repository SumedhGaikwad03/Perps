# Matching Engine Service (`apps/engine`)

The **Matching Engine Service** is the analytical core of the Perps Trading Platform. It executes continuous orderbook matching, enforces risk rules, checks collateral, settles funding, and conducts liquidations entirely in memory for high-throughput performance.

---

## 1. Responsibilities & Structure

### Core Responsibilities:
1. **In-Memory Orderbooks**: Maintains deterministic price-time priority L2 orderbooks for all supported derivative markets (`BTC_USDC`, `SOL_USDC`, `ETH_USDC`).
2. **Order Matching & Execution**: Processes Limit, Market, and FOK orders, calculates multi-maker partial fills, updates filled quantities, and generates trade events.
3. **Risk Management & Margin Validation**: Validates user initial margin against leverage, locks balance upon limit order placement, and releases margin upon fill or cancellation.
4. **Mark Price & Oracle Integration**: Consumes live futures trade updates from Binance WebSocket to calculate real-time mark prices.
5. **Continuous Liquidation Sweeps**: Runs a 1,000ms poller to detect accounts where equity drops below maintenance margin requirements (MMR = 2.5%), auto-closing bankrupt positions and purging resting orders.
6. **Hourly Funding Settlements**: Runs a 3,600,000ms poller calculating premium deviations between perpetual price and spot mark price to exchange cash flows between long and short traders.
7. **State Hydration on Boot**: Fully reconstitutes markets, orders, positions, and balances from PostgreSQL before starting stream processing.

### Source File Structure:
```
apps/engine/
├── index.ts                           # Service entry point & daemon orchestrator
├── oracel.ts                          # Standalone oracle polling helper
├── src/
│   ├── config.ts                      # Timing intervals, MRR, stream keys, token maps
│   ├── types.ts                       # OrderBook, PriceLevel, Position, UserBalance definitions
│   ├── bootstrap/
│   │   └── hydrate.ts                 # Database-to-memory state hydration
│   ├── market-data/
│   │   ├── binance.ts                 # Binance WebSocket connection and price feed handler
│   │   ├── mark-price.ts              # Mark price retrieval utilities
│   │   └── index.ts                   # Market data exports
│   ├── matching-engine/
│   │   ├── matching.ts                # Main matching algorithm, execution, and price-level queue helpers
│   │   └── index.ts                   # Matching exports
│   ├── orders/
│   │   ├── order.service.ts           # handleCreateOrder handler
│   │   ├── order-cancellation.ts      # handleCancelOrder handler
│   │   ├── exit-position.service.ts   # handleExitPosition handler
│   │   ├── collateral.service.ts      # handleOnRamp and handleOffRamp handlers
│   │   ├── market.service.ts          # handleCreateMarket handler
│   │   └── order-validation.ts        # Margin and price validations
│   ├── positions/
│   │   ├── position.service.ts        # updatePositionFills, position netting & flipping
│   │   ├── pnl.ts                     # Realized and unrealized PnL formulas
│   │   └── index.ts                   # Position exports
│   ├── risk/
│   │   ├── margin.ts                  # Margin & equity formulas
│   │   ├── liquidation.ts             # sweepLiquadations routine and 1s poller
│   │   ├── funding.ts                 # fundingRate routine and 1h poller
│   │   └── index.ts                   # Risk exports
│   ├── state/
│   │   ├── orderbooks.ts              # Orderbook Map registry & Redis depth mirror
│   │   ├── balances.ts                # In-memory balances registry & Redis mirror
│   │   ├── positions.ts               # In-memory positions registry & Redis mirror
│   │   ├── prices.ts                  # Mark prices registry
│   │   └── index.ts                   # State exports
│   ├── streams/
│   │   ├── consumer.ts                # Redis Stream consumer loop for 'engine'
│   │   ├── publisher.ts               # Redis Stream publisher for 'to-backend' and 'db-events'
│   │   └── index.ts                   # Stream exports
│   └── utils/
│       ├── logger.ts                  # Colorized terminal logging utilities
│       └── precision.ts               # Precision truncation and rounding
```

---

## 2. In-Memory State Model

The engine keeps complete operational state in RAM using native TypeScript collections:

* **Orderbooks**: `orderBooks = new Map<string, OrderBook>()`
  - `bids: Map<string, PriceLevel>`
  - `asks: Map<string, PriceLevel>`
  - `lastTradedPrice: number`
* **Balances**: `balances = new Map<string, UserBalance>()`
  - `available_bal: string`
  - `locked_bal: string`
* **Positions**: `positions = new Map<string, Position>()` (keyed by `${userId}:${marketId}`)
  - `side: "LONG" | "SHORT"`
  - `qty: string`
  - `entryPrice: string`
  - `margin: string`
  - `leverage: string`
* **Mark Prices**: `markPrices = new Map<string, string>()` (keyed by Base Token: `BTC`, `ETH`, `SOL`)

---

## 3. Startup State Hydration

File: [apps/engine/src/bootstrap/hydrate.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/bootstrap/hydrate.ts)

When `apps/engine` launches, `await bootstrapEngine()` runs before consuming new commands:
1. **Hydrates Markets**: Pulls all markets from PostgreSQL, creates empty `OrderBook` objects with bids/asks Maps, and populates `baseTokenToMarkets`.
2. **Hydrates Wallets**: Pulls all wallets from PostgreSQL, setting `balances.set(w.userId, { available_bal, locked_bal })` and mirroring to Redis `user:${userId}:balances`.
3. **Hydrates Positions**: Loads active positions (`size !== "0"`), sets `positions.set("${p.userId}:${p.marketId}", ...)`, and mirrors to Redis `user:${p.userId}:positions`.
4. **Hydrates Resting Orders**: Loads all orders with status `OPEN` or `PARTIALLY_FILLED`, calculates remaining quantity (`parseFloat(o.qty) - parseFloat(o.filledQty)`), inserts them into the appropriate `PriceLevel.orders` array, recalculates `level.totalQty`, mirrors to Redis `user:${o.userId}:open_orders`, and publishes initial depth snapshots.
