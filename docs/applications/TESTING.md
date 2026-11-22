# Testing Suite (`apps/tests`)

The **Testing Suite** is an end-to-end integration and system verification harness built with Bun's native test runner (`bun:test`). It verifies cross-process trading operations, precision calculations, multi-party matching, risk boundaries, and database persistence.

---

## 1. Test Harness Overview

File: [apps/tests/index.test.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/tests/index.test.ts) (3,275 lines of code)

### Execution Model:
* Runs against a live local cluster (`apps/backend` on port 3000, `apps/engine`, `apps/ws` on port 3001, `apps/db-events`, PostgreSQL, Redis).
* Uses Axios to execute authentic HTTP calls against the backend.
* Directly inspects PostgreSQL via `prisma` to verify asynchronous persistence and state integrity.
* Uses dynamic cryptographic suffixes (`Date.now() + Math.random()`) to ensure test user isolation and repeatability.

---

## 2. Test Suite Inventory

The test harness is organized into 24 sequential test suites:

| Suite # | Suite Title | Scope of Verification |
| :--- | :--- | :--- |
| **1** | Authentication Integration Tests | User signup, password hashing, duplicate user rejection, signin, and JWT generation. |
| **2** | Admin Market Creation Tests | Protected market creation via `admin_secret`, symbol/slug uniqueness, and base token validation. |
| **3** | Collateral On-Ramp Tests | Depositing collateral, validating balance increments, and rejection of negative amounts. |
| **4** | Order Validation Tests | Validating market IDs, side ("BID"/"ASK"), order types, time-in-force ("GTC"/"FOK"), and leverage. |
| **5** | Order Placement Tests | Limit order placement, margin locking, price-level queueing, and order ID generation. |
| **6** | Order Cancellation Tests | Cancelling resting orders, balance unlocking, and removing orders from depth ladders. |
| **7** | Database Persistence Tests | Asynchronous verification that `apps/db-events` writes orders and wallets to PostgreSQL. |
| **8** | Matching Engine Consistency Tests | Matching cross-orders, trade execution, and execution price determination. |
| **9** | Additional Market Validation Tests | Invalid tick sizes, unsupported tokens, and edge case market queries. |
| **10** | Additional Order Validation Tests | Zero quantity, negative price, and invalid boolean reduceOnly edge cases. |
| **11** | Additional Order Cancellation Security | Preventing users from cancelling orders belonging to other accounts. |
| **12** | Additional Database Integrity Tests | Foreign key constraints and transaction rollback verification. |
| **13** | Authentication Edge Case Tests | Expired tokens, malformed headers, and non-existent usernames. |
| **14** | On-Ramp Input Edge Case Tests | Array inputs, stringified objects, and non-numeric payloads. |
| **15** | Order Input Edge Case Tests | Extreme leverage values, extreme price levels, and overflow checks. |
| **16** | Market Precision Validation Tests | Step size quantization, tick size rounding, and precision preservation. |
| **17** | Fill Accounting Integrity Tests | Maker/taker fee calculations, executed fill quantities, and remaining quantities. |
| **18** | Position Accounting Integrity | Weighted average entry prices, position sizing, and directional netting. |
| **19** | Multiple Maker Fills | A single aggressive taker eating through multiple resting maker orders across price levels. |
| **20** | Position Lifecycle | Opening, adding to, scaling down, and closing positions. |
| **21** | Position Flipping | Atomically transitioning a position from Long to Short (or vice versa) in a single fill. |
| **22** | Margin and Wallet Accounting | Verifying available balance and locked balance arithmetic across the trading lifecycle. |
| **23** | Order Execution Edge Cases | Self-trade prevention, empty orderbook matching, and market order slippage limits. |
| **24** | Real-Time WebSocket & Distributed Pipeline Simulation | End-to-end multi-party exchange simulation with simultaneous WS stream subscriptions. |

---

## 3. Running the Test Suite

```bash
# Ensure infrastructure and all backend services are running
cd Perps/apps/tests
bun test index.test.ts
```
