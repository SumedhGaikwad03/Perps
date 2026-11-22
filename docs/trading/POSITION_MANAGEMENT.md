# Position Management & Accounting

File: [apps/engine/src/positions/position.service.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/positions/position.service.ts)

The Position Management module tracks directional position inventory, updates weighted average entry prices, handles position reductions, and executes atomic position flipping.

---

## 1. Position Representation

In the matching engine, an active position is represented by:
```typescript
export interface Position {
  userId: string;
  marketId: string;
  side: "LONG" | "SHORT";
  qty: string;
  baseToken: string;
  entryPrice: string;
  margin: string;
  leverage: string;
}
```
* Keyed in-memory by composite key: `${userId}:${marketId}`.
* In PostgreSQL, persisted in the `Position` table with a composite unique constraint on `[userId, marketId]`.
* Sized as a signed integer/decimal string: `> 0` represents Long, `< 0` represents Short.

---

## 2. Fill Execution Lifecycle (`updatePositionFills`)

When an order match generates fills, `updatePositionFills` is called for both the taker and maker.

### Scenario A: Opening a New Position
If no position exists for this `(userId, marketId)`:
* Sizing: `qty = fillQty`.
* Side: `"LONG"` if Buy fill, `"SHORT"` if Sell fill.
* Entry Price: `fillPrice`.
* Margin: `(fillQty * fillPrice) / leverage`.
* The position is saved in memory and upserted in Redis.

### Scenario B: Adding to an Existing Position (Same Direction)
If a trader is Long 1 BTC at \$80,000 and buys 1 BTC at \$90,000:
* **Weighted Average Entry Price**:
  $$\text{NewEntryPrice} = \frac{(\text{ExistingQty} \times \text{ExistingPrice}) + (\text{IncomingQty} \times \text{IncomingPrice})}{\text{ExistingQty} + \text{IncomingQty}}$$
  $$\text{NewEntryPrice} = \frac{(1 \times 80,000) + (1 \times 90,000)}{2} = \$85,000$$
* Margin is incremented:
  $$\text{NewMargin} = \text{ExistingMargin} + \frac{\text{IncomingQty} \times \text{IncomingPrice}}{\text{Leverage}}$$

### Scenario C: Scaling Down a Position (Opposite Direction, Fill $\le$ Existing)
If a trader is Long 2 BTC at \$80,000 and sells 1 BTC at \$90,000:
* Direction remains `"LONG"`.
* New Quantity: $2 - 1 = 1\text{ BTC}$.
* Entry price remains unchanged at **\$80,000**.
* **Realized PnL** is settled:
  $$\text{rPnL} = (90,000 - 80,000) \times 1 = +\$10,000$$
* Margin released:
  $$\text{ReleasedMargin} = \text{ExistingMargin} \times \left(\frac{\text{ClosedQty}}{\text{ExistingQty}}\right)$$
* Released margin + rPnL is returned to `available_bal`.

### Scenario D: Position Flipping (Opposite Direction, Fill > Existing)
If a trader is Long 1 BTC at \$80,000 and sells 3 BTC at \$90,000 in a single match:
1. **Close Existing Long (1 BTC)**:
   - Settles realized PnL on 1 BTC: $(90,000 - 80,000) \times 1 = +\$10,000$.
   - Releases entire margin of existing position.
2. **Open New Short (2 BTC)**:
   - Side becomes `"SHORT"`.
   - New Quantity = $3 - 1 = 2\text{ BTC}$.
   - New Entry Price = **\$90,000** (the execution price).
   - Margin required for remaining 2 BTC is locked from available balance.
