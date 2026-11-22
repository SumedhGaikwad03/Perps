# Orderbook Data Structures

Files:
* [apps/engine/src/types.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/types.ts)
* [apps/engine/src/state/orderbooks.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/state/orderbooks.ts)
* [apps/engine/src/matching-engine/price-level.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/matching-engine/price-level.ts)

The Perps matching engine uses an in-memory L2 orderbook architecture engineered for deterministic price-time priority.

---

## 1. Data Structure Definitions

```typescript
// apps/engine/src/types.ts
export type OpenOrder = {
  userId: string;
  originalOrderId: string;
  filledQty: string;
  lockedMargin: string;
  reduceOnly: boolean;
  qty: string;
  leverage: string;
};

export type PriceLevel = {
  totalQty: string;          // Cumulative quantity resting at this exact price level
  orders: OpenOrder[];       // FIFO queue preserving time priority
};

export interface OrderBook {
  bids: Map<string, PriceLevel>;   // Price -> PriceLevel map (Sorted descending on traversal)
  asks: Map<string, PriceLevel>;   // Price -> PriceLevel map (Sorted ascending on traversal)
  lastTradedPrice: number;         // Most recent execution price
  marketId: string;                // Market UUID
  baseToken: string;               // "BTC", "ETH", "SOL"
  symbol: string;                  // "BTC_USDC"
  tickSize: string;                // Minimum price tick (e.g. "0.1")
  stepSize: string;                // Minimum size step (e.g. "0.001")
}
```

---

## 2. Price-Time Priority Model

The engine enforces strict **Price-Time Priority (FIFO)**:
1. **Price Priority**:
   - For incoming Bids: Best prices are the **lowest** available Asks. Asks are traversed in ascending numeric order.
   - For incoming Asks: Best prices are the **highest** available Bids. Bids are traversed in descending numeric order.
2. **Time Priority**:
   - Within each `PriceLevel`, orders are stored in a contiguous FIFO array `orders: OpenOrder[]`.
   - The first order pushed into `orders` is the first to be matched against incoming opposing liquidity.

---

## 3. Orderbook Operations

### 1. Order Insertion
When a resting limit order is placed:
1. The engine checks if a `PriceLevel` already exists for that price string in `book.bids` or `book.asks`.
2. If it does not exist, an empty level is instantiated:
   ```typescript
   level = { totalQty: "0", orders: [] };
   book.bids.set(priceString, level);
   ```
3. The order is pushed to `level.orders.push(openOrder)`.
4. `level.totalQty` is updated by summing the remaining unfulfilled quantities of all orders in the level:
   ```typescript
   level.totalQty = level.orders
     .reduce((sum, o) => sum + (parseFloat(o.qty) - parseFloat(o.filledQty)), 0)
     .toString();
   ```

### 2. Order Removal & Garbage Collection
When an order is completely filled or cancelled:
1. It is removed from `level.orders`.
2. If `level.orders.length === 0`, the entire price key is deleted from `book.bids` or `book.asks` (`map.delete(priceString)`).
3. This prevents memory bloat from inactive price ticks.

---

## 4. Depth Mirroring to Redis

File: [apps/engine/src/state/orderbooks.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/state/orderbooks.ts#L17-L81)

Whenever the orderbook changes (after match, order placement, or cancellation), `mirrorOrderBookDepth(marketId, depth = 50)` is invoked:
1. Bids are extracted from `book.bids`, sorted descending by price, filtered for `qty > 0`, and sliced to the top 50 levels.
2. Asks are extracted from `book.asks`, sorted ascending by price, filtered for `qty > 0`, and sliced to the top 50 levels.
3. Formats an L2 snapshot:
   ```typescript
   const depthSnapshot = {
     marketId,
     symbol: book.symbol,
     lastTradedPrice: book.lastTradedPrice.toString(),
     bids, // [ [price, qty], ... ]
     asks, // [ [price, qty], ... ]
     timestamp: Date.now()
   };
   ```
4. Atomically saves to Redis Hashes:
   - `HSET market:${marketId}:depth data <JSON>`
   - `HSET market:${book.symbol}:depth data <JSON>`
5. Publishes real-time event to Redis Pub/Sub:
   - `PUBLISH pub:depth:${marketId} <JSON>`
   - `PUBLISH pub:depth:${book.symbol} <JSON>`
