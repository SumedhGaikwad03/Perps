# Margin and Leverage Calculations

Files:
* [apps/engine/src/risk/margin.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/risk/margin.ts)
* [apps/engine/src/positions/pnl.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/positions/pnl.ts)

This document provides mathematical formulas and implementations for margin, leverage, notional values, and profit/loss calculations.

---

## 1. Initial Margin Formula

File: [apps/engine/src/risk/margin.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/risk/margin.ts#L16-L26)

When an order is submitted or a position opened, the user must commit an **Initial Margin** determined by the order size, price, and chosen leverage:

$$\text{InitialMargin} = \frac{\text{Qty} \times \text{Price}}{\text{Leverage}}$$

### Concrete Example:
* Order: Buy 2 BTC at \$90,000 limit with 10x leverage.
* Notional Value = $2 \times 90,000 = \$180,000$.
* Initial Margin = $\frac{180,000}{10} = \$18,000$.
* The trader must possess at least \$18,000 in `available_bal`.

---

## 2. Maintenance Margin Formula

File: [apps/engine/src/risk/margin.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/risk/margin.ts#L7-L13)

The **Maintenance Margin Requirement (MMR)** is the minimum collateral necessary to keep a position active:

$$\text{MaintenanceMargin} = \text{Qty} \times \text{MarkPrice} \times \text{DefaultMrr}$$

* Constant: `DefaultMrr = 0.025` (2.5%).

### Concrete Example:
* Position: 2 BTC Long with mark price at \$85,000.
* Maintenance Margin = $2 \times 85,000 \times 0.025 = \$4,250$.

---

## 3. Position Equity & Unrealized PnL

File: [apps/engine/src/risk/margin.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/risk/margin.ts#L28-L37)
File: [apps/engine/src/positions/pnl.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/positions/pnl.ts#L18-L33)

### Unrealized PnL:
* **Long Position**:
  $$\text{uPnL} = (\text{MarkPrice} - \text{EntryPrice}) \times \text{Qty}$$
* **Short Position**:
  $$\text{uPnL} = (\text{EntryPrice} - \text{MarkPrice}) \times \text{Qty}$$

### Equity:
$$\text{Equity} = \text{InitialMargin} + \text{uPnL}$$

### Liquidation Threshold Example:
* Entry: 2 BTC Long at \$90,000 with 10x leverage ($\text{InitialMargin} = \$18,000$).
* Mark price drops to \$82,880:
  - $\text{uPnL} = (82,880 - 90,000) \times 2 = -\$14,240$.
  - $\text{Equity} = 18,000 - 14,240 = \$3,760$.
  - $\text{MMR} = 2 \times 82,880 \times 0.025 = \$4,144$.
  - Since $\text{Equity} (\$3,760) \le \text{MMR} (\$4,144)$, **liquidation is triggered**.

---

## 4. Realized Profit and Loss (Closed Positions)

File: [apps/engine/src/positions/pnl.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/positions/pnl.ts#L7-L16)

When an existing position is closed or scaled down:
* **Closing a Long**:
  $$\text{rPnL} = (\text{ExitPrice} - \text{EntryPrice}) \times \text{ClosedQty}$$
* **Closing a Short**:
  $$\text{rPnL} = (\text{EntryPrice} - \text{ExitPrice}) \times \text{ClosedQty}$$

Realized PnL is immediately credited to (or deducted from) the trader's `available_bal`, and the locked initial margin associated with `ClosedQty` is released.
