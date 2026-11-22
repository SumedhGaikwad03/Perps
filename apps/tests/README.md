# Integration Test Suite (`apps/tests`)

The **Integration Test Suite** is an end-to-end integration and system verification harness built with Bun's native test runner (`bun:test`).

For the complete inventory of test suites, see [Testing Documentation](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/applications/TESTING.md).

---

## Key Features

* **3,275 Lines of Integration Tests**: 24 distinct test suites evaluating every aspect of the trading system.
* **Full Stack Verification**: Dispatches real HTTP requests to the REST backend and directly queries PostgreSQL via Prisma to verify asynchronous persistence.
* **Coverage Scope**:
  1. Authentication & JWT validation
  2. Protected admin market creation
  3. Collateral on-ramp deposits and off-ramp withdrawals
  4. Limit and Market order validation and placement
  5. Order cancellation and margin unlocking
  6. Multi-maker partial fills and price-time execution
  7. Position lifecycle (opening, adding, scaling down, flipping)
  8. Liquidation and maintenance margin triggers
  9. Real-time WebSocket streaming simulation

---

## Running Tests

Ensure all platform services (`apps/backend`, `apps/engine`, `apps/ws`, `apps/db-events`, PostgreSQL, Redis) are running before executing tests:

```bash
# Run all integration tests
bun test index.test.ts

# Run specific suite by pattern
bun test index.test.ts -t "Authentication"
```
