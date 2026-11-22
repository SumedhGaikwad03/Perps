# Risk Engine Specification

Files:
* [apps/engine/src/risk/margin.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/risk/margin.ts)
* [apps/engine/src/risk/liquidation.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/risk/liquidation.ts)
* [apps/engine/src/risk/funding.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/risk/funding.ts)
* [apps/engine/src/market-data/binance.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/market-data/binance.ts)

The Risk Engine protects the exchange solvency by enforcing pre-trade margin checks, continuous liquidation monitoring against mark prices, and periodic funding settlements.

---

## 1. External Mark Price Oracle

The engine tracks underlying spot/futures mark prices via Binance's continuous public futures WebSocket (`wss://fstream.binance.com/ws`):
* Streams subscribed: `<symbol>@aggTrade` for `btcusdt`, `ethusdt`, `solusdt`.
* On message arrival:
  ```typescript
  const trade = JSON.parse(event.data);
  const markPrice = trade.p; // execution price string
  markPrices.set(baseToken, markPrice);
  ```
* Mark prices are stored in-memory and used for unrealized PnL, liquidation checks, and funding rate deviations.

---

## 2. Continuous Liquidation Sweeps (`sweepLiquadations`)

File: [apps/engine/src/risk/liquidation.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/risk/liquidation.ts)

The engine runs a background poller every **1,000 milliseconds** (`liquadation_intervals = 1000`).

### Step-by-Step Liquidation Check:
For every active position `(userId, marketId)`:
1. Obtains position parameters: `entryPrice`, `margin` (initial margin), `qty`, `side` ("LONG" or "SHORT").
2. Obtains current `markPrice` for the market's base token.
3. Computes **Unrealized PnL**:
   $$\text{UnrealizedPnL}_{\text{LONG}} = (\text{markPrice} - \text{entryPrice}) \times \text{qty}$$
   $$\text{UnrealizedPnL}_{\text{SHORT}} = (\text{entryPrice} - \text{markPrice}) \times \text{qty}$$
4. Computes **Position Equity**:
   $$\text{Equity} = \text{InitialMargin} + \text{UnrealizedPnL}$$
5. Computes **Maintenance Margin Requirement (MMR)**:
   $$\text{MMR} = \text{qty} \times \text{markPrice} \times \text{DefaultMrr}$$
   *(where $\text{DefaultMrr} = 0.025$, representing a 2.5% maintenance margin requirement).*
6. **Insolvency Trigger**:
   $$\text{If } \text{Equity} \le \text{MMR}$$
   The account is marked for immediate liquidation:
   - Position is deleted from memory via `deletePosition(posKey)`.
   - Remaining unencumbered equity (if positive) is returned to available balance:
     $$\text{newAvail} = \text{currentAvail} + \max(0, \text{Equity})$$
     $$\text{newLocked} = \max(0, \text{locked\_bal} - \text{InitialMargin})$$
   - All resting bids and asks for this user are purged from the orderbook.
   - Emits `WALLET_UPDATE` and `POSITION_LIQUIDATED` to `db-events`.
   - Redis mirrors and WebSocket notifications are published.

---

## 3. Funding Rate Mechanism (`fundingRate`)

File: [apps/engine/src/risk/funding.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/risk/funding.ts)

The engine executes funding settlements every **1 hour** (`fundingRate_poller = 60 * 60 * 1000`).

### Step-by-Step Settlement:
1. Compares perpetual market price (`book.lastTradedPrice`) against spot mark price (`markPrice`).
2. Calculates **Premium Rate**:
   $$\text{PremiumRate} = \frac{\text{PerpPrice} - \text{MarkPrice}}{\text{MarkPrice}}$$
3. Clamps the rate to prevent extreme liquidity shocks:
   $$\text{PremiumRate} = \min(\max(\text{PremiumRate}, -0.0005), 0.0005)$$
   *(Clamped between -0.05% and +0.05%).*
4. Evaluates cash flow direction:
   - If $\text{PremiumRate} > 0$: Perpetual is trading higher than spot $\implies$ Longs pay Shorts.
   - If $\text{PremiumRate} < 0$: Perpetual is trading lower than spot $\implies$ Shorts pay Longs.
5. Settles payments:
   $$\text{NotionalValue} = \text{qty} \times \text{MarkPrice}$$
   $$\text{PaymentValue} = \text{NotionalValue} \times |\text{PremiumRate}|$$
   - Deducts from payers' `available_bal` and credits to payees' `available_bal`.
   - Emits `WALLET_UPDATE` to `db-events`.
