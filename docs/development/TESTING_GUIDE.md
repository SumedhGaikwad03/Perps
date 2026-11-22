# Testing Guide

This guide describes how to run, write, and debug integration tests within the Perps platform.

---

## 1. Test Harness Architecture

File: [apps/tests/index.test.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/tests/index.test.ts)

The test harness uses **Bun's native test runner (`bun:test`)** and evaluates system health against live backend processes:

* **Fast Execution**: Bun's native test runner executes tests in milliseconds without babel, ts-node, or jest transpilation layers.
* **Axios HTTP Client**: Dispatches real network requests to `http://localhost:3000`.
* **Prisma Verification**: Directly inspects the underlying PostgreSQL database to assert asynchronous database event processing.

---

## 2. Running Tests

### Running the Complete Test Suite:
```bash
# From repository root
cd apps/tests
bun test index.test.ts
```

### Running Specific Test Suites:
You can filter tests by name or description:
```bash
# Run only authentication tests
bun test index.test.ts -t "Authentication"

# Run only matching engine tests
bun test index.test.ts -t "Matching Engine"

# Run only liquidation and risk tests
bun test index.test.ts -t "Margin"
```

---

## 3. Writing New Integration Tests

To add a test suite in `apps/tests/index.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import axios from "axios";
import { BACKEND } from "./config";
import { prisma } from "db";

describe("Custom Test Suite", () => {
  it("should assert custom trading behavior", async () => {
    const res = await axios.post(`${BACKEND}/api/v1/order`, {
      marketId: "019318a0-2f94-7128-b0cf-53e30f146a05",
      side: "BID",
      qty: "1.0",
      price: "85000",
      orderType: "LIMIT"
    }, {
      headers: { token: myTestToken }
    });

    expect(res.status).toBe(200);
    expect(res.data.result.status).toBe("OPEN");

    // Asynchronously assert database persistence
    const dbOrder = await prisma.order.findUnique({
      where: { id: res.data.orderId }
    });
    expect(dbOrder).toBeDefined();
    expect(dbOrder?.status).toBe("OPEN");
  });
});
```
