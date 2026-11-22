# Matching Engine (`apps/engine`)

The **Matching Engine** is the high-performance in-memory core of the Perps Trading Platform. It processes incoming trading commands sequentially from Redis Streams, matches orders, calculates margin and leverage, conducts liquidations, and settles funding.

For detailed algorithms and formulas, see [apps/engine Documentation](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/applications/MATCHING_ENGINE.md) and [Trading Lifecycle](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/trading/TRADING_LIFECYCLE.md).

---

## Key Features

* **Deterministic In-Memory Orderbook**: Custom price-time priority (FIFO) orderbook using nested Maps and arrays.
* **Stream-Based Ingestion**: Consumes from Redis stream `engine` with consumer group `engine-consumer-group`.
* **Zero-Lag State Mirroring**: Immediately writes updated L2 depth ladders, balances, open orders, and positions to Redis Hashes and Pub/Sub topics.
* **Risk Engine**:
  - Validates initial margin: $\text{Margin} = (\text{Qty} \times \text{Price}) / \text{Leverage}$.
  - Continuous 1-second liquidation sweeper: Liquidates positions when $\text{Equity} \le \text{MMR}$ ($\text{DefaultMrr} = 0.025$).
  - Continuous 1-hour funding rate settlements anchored to spot mark prices.
* **Oracle Integration**: Persistent WebSocket feed from Binance futures (`btcusdt`, `ethusdt`, `solusdt`).
* **Startup Hydration**: Restores all active markets, wallets, positions, and open resting orders from PostgreSQL before opening stream processing.

---

## Running the Engine

```bash
# Install dependencies
bun install

# Run matching engine daemon
bun run index.ts

# Type check
bun run check-types
```
