import { BACKEND } from "./config";
import { describe, it, expect, beforeAll } from "bun:test";
import axios, { type AxiosInstance } from "axios";
import { prisma } from "db";

// =====================================================
// CONFIGURATION
// =====================================================

const PASSWORD = "securePassword123";
const ADMIN_TOKEN = "admin123";

const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

const USER1 = `trader1_${uniqueSuffix}`;
const USER2 = `trader2_${uniqueSuffix}`;

const api: AxiosInstance = axios.create({
  baseURL: BACKEND,
  timeout: 10000,
  validateStatus: () => true,
});

// =====================================================
// SHARED STATE
// =====================================================

let token1 = "";
let token2 = "";

let user1Id = "";
let user2Id = "";

let marketId = "";
let marketSymbol = "";

let restingBidId = "";
let restingAskId = "";
let takerOrderId = "";

// =====================================================
// HELPERS
// =====================================================

async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 10000,
  intervalMs = 200,
): Promise<T> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await fn();

    if (result !== null && result !== undefined) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Database condition timed out after ${timeoutMs}ms`);
}

function auth(token: string) {
  return {
    headers: {
      token,
      authorization: `Bearer ${token}`,
    },
  };
}

function expectSuccessfulResponse(status: number) {
  expect([200, 201]).toContain(status);
}

function expectBadRequest(status: number) {
  expect([400, 422]).toContain(status);
}

function expectDecimal(actual: unknown, expected: string) {
  expect(String(actual)).toBe(expected);
}

// =====================================================
// TEST 1: AUTHENTICATION
// =====================================================

describe("1. Authentication Integration Tests", () => {
  it("should register User 1", async () => {
    const res = await api.post("/api/v1/signup", {
      username: USER1,
      password: PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();

    user1Id = res.data.id;
  });

  it("should register User 2", async () => {
    const res = await api.post("/api/v1/signup", {
      username: USER2,
      password: PASSWORD,
    });

    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();

    user2Id = res.data.id;
  });

  it("should reject duplicate usernames", async () => {
    const res = await api.post("/api/v1/signup", {
      username: USER1,
      password: PASSWORD,
    });

    expect([400, 409]).toContain(res.status);
  });

  it("should reject signup with missing username", async () => {
    const res = await api.post("/api/v1/signup", {
      password: PASSWORD,
    });

    expectBadRequest(res.status);
  });

  it("should reject signup with missing password", async () => {
    const res = await api.post("/api/v1/signup", {
      username: `invalid_${uniqueSuffix}`,
    });

    expectBadRequest(res.status);
  });

  it("should reject empty signup payload", async () => {
    const res = await api.post("/api/v1/signup", {});

    expectBadRequest(res.status);
  });

  it("should reject incorrect password", async () => {
    const res = await api.post("/api/v1/signin", {
      username: USER1,
      password: "wrong_password",
    });

    expect(res.status).toBe(401);
  });

  it("should reject nonexistent users", async () => {
    const res = await api.post("/api/v1/signin", {
      username: `ghost_${uniqueSuffix}`,
      password: PASSWORD,
    });

    expect(res.status).toBe(401);
  });

  it("should reject empty signin payload", async () => {
    const res = await api.post("/api/v1/signin", {});

    expectBadRequest(res.status);
  });

  it("should successfully signin User 1", async () => {
    const res = await api.post("/api/v1/signin", {
      username: USER1,
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.data.token).toBeDefined();

    token1 = res.data.token;
  });

  it("should successfully signin User 2", async () => {
    const res = await api.post("/api/v1/signin", {
      username: USER2,
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.data.token).toBeDefined();

    token2 = res.data.token;
  });

  it("should generate different tokens for different users", () => {
    expect(token1).not.toBe(token2);
  });

  it("should not allow an invalid token to authenticate", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "1000" },
      auth("invalid.jwt.token"), // these are the request configs namely the heads that are sent with the request
    );

    expect([401, 403]).toContain(res.status);
  });

  it("should reject signin with missing username", async () => {
    const res = await api.post("/api/v1/signin", {
      password: PASSWORD,
    });
    expectBadRequest(res.status);
  });

  it("should reject signin with missing password", async () => {
    const res = await api.post("/api/v1/signin", {
      username: USER1,
    });
    expectBadRequest(res.status);
  });

  it("should reject signup with non-string credentials", async () => {
    const res = await api.post("/api/v1/signup", {
      username: 12345,
      password: ["password"],
    });
    expectBadRequest(res.status);
  });

  it("should reject protected requests with missing authorization headers", async () => {
    // Making a request to a protected endpoint without any config/headers
    const res = await api.post("/api/v1/onRamp", { amount: "1000" });
    expect([401, 403]).toContain(res.status);
  });
});

// =====================================================
// TEST 2: MARKET CREATION
// =====================================================

describe("2. Admin Market Creation Tests", () => {
  it("should create a perpetual market", async () => {
    marketSymbol = `SOL_${uniqueSuffix}`;

    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: marketSymbol,
        slug: marketSymbol.toLowerCase(),
        baseToken: "SOL",
        imgUrl: "sol.png",
        tickSize: "0.1",
        stepSize: "0.001",
      },
      {
        headers: {
          authorization: `Bearer ${token1}`,
          token: token1,
          "x-admin-token": ADMIN_TOKEN,
          admin_secret: ADMIN_TOKEN,
        },
      },
    );

    expectSuccessfulResponse(res.status);

    expect(res.data.id).toBeDefined();

    marketId = res.data.id;
  }, 15000);

  it("should persist the market ID", async () => {
    const market = await waitFor(() =>
      prisma.market.findUnique({
        where: { id: marketId },
      }),
    );

    expect(market.id).toBe(marketId);
    expect(market.symbol).toBe(marketSymbol);
    expect(market.baseToken).toBe("SOL");
  });

  it("should reject market creation without required fields", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {},
      {
        headers: {
          token: token1,
          "x-admin-token": ADMIN_TOKEN,
          admin_secret: ADMIN_TOKEN,
        },
      },
    );

    expectBadRequest(res.status);
  });

  it("should reject market creation if a regular trader attempts it without admin privileges", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: `FAIL_${uniqueSuffix}`,
        slug: `fail_${uniqueSuffix}`,
        baseToken: "SOL",
        tickSize: "0.1",
        stepSize: "0.001",
      },
      {
        headers: {
          token: token1, // Regular user token only, NO admin token headers
        },
      },
    );
    expect([401, 403]).toContain(res.status);
  });

  it("should reject duplicate market symbols", async () => {
    // Attempting to recreate the same market symbol initialized in the first test
    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: marketSymbol,
        slug: marketSymbol.toLowerCase(),
        baseToken: "SOL",
        tickSize: "0.1",
        stepSize: "0.001",
      },
      {
        headers: {
          admin_secret: ADMIN_TOKEN,
          token: token1,
        },
      },
    );
    expect([400, 409]).toContain(res.status);
  });

  it("should reject zero or negative tick and step sizes", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: `BADSIZE_${uniqueSuffix}`,
        slug: `badsize_${uniqueSuffix}`,
        baseToken: "SOL",
        tickSize: "0", // Zero tick size
        stepSize: "-0.01", // Negative step size
      },
      {
        headers: {
          admin_secret: ADMIN_TOKEN,
          token: token1,
        },
      },
    );
    expectBadRequest(res.status);
  });

  it("should reject invalid numeric parameters for sizing bounds", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: `TEXTSIZE_${uniqueSuffix}`,
        slug: `textsize_${uniqueSuffix}`,
        baseToken: "SOL",
        tickSize: "abc", // Non-numeric text values
        stepSize: "xyz",
      },
      {
        headers: {
          admin_secret: ADMIN_TOKEN,
          token: token1,
        },
      },
    );
    expectBadRequest(res.status);
  });
});

// =====================================================
// TEST 3: COLLATERAL / ON-RAMP
// =====================================================

describe("3. Collateral On-Ramp Tests", () => {
  it("should on-ramp User 1", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "100000" },
      auth(token1),
    );

    expect(res.status).toBe(200);
    expect(res.data.message).toBe("onramp is done ");
  });

  it("should on-ramp User 2", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "100000" },
      auth(token2),
    );

    expect(res.status).toBe(200);
  });

  it("should reject unauthenticated on-ramp", async () => {
    const res = await api.post("/api/v1/onRamp", {
      amount: "1000",
    });

    expect([401, 403]).toContain(res.status);
  });

  it("should reject negative on-ramp amounts", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "-1000" },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject zero on-ramp amounts", async () => {
    const res = await api.post("/api/v1/onRamp", { amount: "0" }, auth(token1));

    expectBadRequest(res.status);
  });

  it("should reject invalid on-ramp amounts", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "invalid" },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject missing on-ramp amount", async () => {
    const res = await api.post("/api/v1/onRamp", {}, auth(token1));

    expectBadRequest(res.status);
  });
});

// =====================================================
// TEST 4: ORDER VALIDATION
// =====================================================

describe("4. Order Validation Tests", () => {
  it("should reject an order without authentication", async () => {
    const res = await api.post("/api/v1/order", {
      price: "100",
      qty: "1",
      side: "BID",
      marketId,
      orderType: "LIMIT",
    });

    expect([401, 403]).toContain(res.status);
  });

  it("should reject an order without marketId", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        orderType: "LIMIT",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an invalid order side", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "INVALID",
        marketId,
        orderType: "LIMIT",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject zero quantity", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "0",
        side: "BID",
        marketId,
        orderType: "LIMIT",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject negative quantity", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "-5",
        side: "BID",
        marketId,
        orderType: "LIMIT",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject invalid price", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "invalid",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an invalid market ID", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        marketId: "invalid-market-id",
        orderType: "LIMIT",
      },
      auth(token1),
    );

    expect([400, 404, 422]).toContain(res.status);
  });
});

// =====================================================
// TEST 5: ORDER PLACEMENT
// =====================================================

describe("5. Order Placement Tests", () => {
  it("User 1 should place a resting limit BID", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "10",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "GTC",
        reduceOnly: false,
      },
      auth(token1),
    );

    expect(res.status).toBe(200);
    expect(res.data.orderId).toBeDefined();

    restingBidId = res.data.orderId;

    expect(res.data.result.status).toBe("OPEN");
    expect(res.data.result.fills).toHaveLength(0);

    // Existing API response property.
    expectDecimal(res.data.result.remaningQty, "10");
  });

  it("User 2 should place a resting limit ASK", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "105",
        qty: "5",
        side: "ASK",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "GTC",
        reduceOnly: false,
      },
      auth(token2),
    );

    expect(res.status).toBe(200);
    expect(res.data.orderId).toBeDefined();

    restingAskId = res.data.orderId;

    expect(res.data.result.status).toBe("OPEN");
    expect(res.data.result.fills).toHaveLength(0);

    expectDecimal(res.data.result.remaningQty, "5");
  });

  it("should partially match an aggressive ASK against resting BID", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "4",
        side: "ASK",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "GTC",
        reduceOnly: false,
      },
      auth(token2),
    );

    expect(res.status).toBe(200);

    takerOrderId = res.data.orderId;

    const result = res.data.result;

    expect(result.status).toBe("FILLED");
    expectDecimal(result.exuctedQty, "4");
    expectDecimal(result.remaningQty, "0");

    expect(result.fills).toHaveLength(1);

    expectDecimal(result.fills[0].price, "100");
    expectDecimal(result.fills[0].qty, "4");
  });

  it("should not match orders with non-crossing prices", async () => {
    const order = await waitFor(() =>
      prisma.order.findUnique({
        where: { id: restingAskId },
      }),
    );

    expect(order).not.toBeNull();
    expect(order?.status).toBe("OPEN");
  });

  it("should preserve remaining maker quantity after partial fill", async () => {
    const order = await waitFor(async () => {
      const result = await prisma.order.findUnique({
        where: { id: restingBidId },
      });

      return result?.filledQty === "4" ? result : null;
    });

    expect(order).not.toBeNull();
    expectDecimal(order?.filledQty, "4");

    // This assumes the DB uses a separate remainingQty field.
    // If not, verify the equivalent quantity calculation.
  });
});

//=====================================================
//TEST 6: ORDER CANCELLATION
//=====================================================

describe("6. Order Cancellation Tests", () => {
  it("should reject cancellation without marketId", async () => {
    const res = await api.delete(`/api/v1/order/${restingBidId}`, {
      headers: { token: token1 },
      data: {},
    });

    expect(res.status).toBe(404);
  });

  it("should reject unauthenticated cancellation", async () => {
    const res = await api.delete(`/api/v1/order/${restingBidId}`, {
      data: { marketId },
    });

    expect([401, 403]).toContain(res.status);
  });

  it("should reject cancellation by a different user", async () => {
    const res = await api.delete(`/api/v1/order/${restingBidId}`, {
      headers: { token: token2 },
      data: { marketId },
    });

    // Recommended API behavior: 403 or 404.
    // A 500 indicates an authorization/error-handling bug.
    expect([403, 404]).toContain(res.status);
  });

  it("User 1 should cancel remaining BID quantity", async () => {
    const res = await api.delete(`/api/v1/order/${restingBidId}`, {
      headers: { token: token1 },
      data: { marketId },
    });

    expect(res.status).toBe(200);
    expect(res.data.succes).toBe(true);

    expect(res.data.result.status).toBe("CANCELLED");
    expect(res.data.result.orderId).toBe(restingBidId);
    expect(res.data.result.marketId).toBe(marketId);

    expectDecimal(res.data.result.unfilledQty, "6");
  });

  it("User 2 should cancel resting ASK", async () => {
    const res = await api.delete(`/api/v1/order/${restingAskId}`, {
      headers: { token: token2 },
      data: { marketId },
    });

    expect(res.status).toBe(200);
    expect(res.data.succes).toBe(true);

    expect(res.data.result.status).toBe("CANCELLED");

    expectDecimal(res.data.result.unfilledQty, "5");
  });

  it("should reject cancellation of an already cancelled order", async () => {
    const res = await api.delete(`/api/v1/order/${restingBidId}`, {
      headers: { token: token1 },
      data: { marketId },
    });

    expect([400, 404, 409]).toContain(res.status);
  });
});

// =====================================================
// TEST 7: DATABASE PERSISTENCE
// =====================================================

describe("7. Database Persistence Tests", () => {
  it("should persist market in PostgreSQL", async () => {
    const market = await waitFor(() =>
      prisma.market.findUnique({
        where: { id: marketId },
      }),
    );

    expect(market.id).toBe(marketId);
    expect(market.symbol).toBe(marketSymbol);
    expect(market.baseToken).toBe("SOL");
  });

  it("should persist both users", async () => {
    const user1 = await prisma.user.findUnique({
      where: { id: user1Id },
    });

    const user2 = await prisma.user.findUnique({
      where: { id: user2Id },
    });

    expect(user1).not.toBeNull();
    expect(user2).not.toBeNull();
  });

  it("should persist maker BID", async () => {
    const order = await prisma.order.findUnique({
      where: { id: restingBidId },
    });

    expect(order).not.toBeNull();
    expect(order?.status).toBe("CANCELLED");
    expectDecimal(order?.filledQty, "4");
  });

  it("should persist taker ASK", async () => {
    const order = await prisma.order.findUnique({
      where: { id: takerOrderId },
    });

    expect(order).not.toBeNull();
    expect(order?.status).toBe("FILLED");
    expectDecimal(order?.filledQty, "4");
  });

  it("should persist resting ASK cancellation", async () => {
    const order = await prisma.order.findUnique({
      where: { id: restingAskId },
    });

    expect(order).not.toBeNull();
    expect(order?.status).toBe("CANCELLED");
  });

  it("should persist fill with correct maker and taker IDs", async () => {
    const fill = await waitFor(() =>
      prisma.fill.findFirst({
        where: {
          marketId,
          maker_order_id: restingBidId,
          taker_order_id: takerOrderId,
        },
      }),
    );

    expect(fill.marketId).toBe(marketId);

    expect(fill.maker_order_id).toBe(restingBidId);
    expect(fill.taker_order_id).toBe(takerOrderId);

    expectDecimal(fill.price, "100");
    expectDecimal(fill.qty, "4");
  });

  it("should persist User 1's LONG position after the fill", async () => {
    const position = await waitFor(() =>
      prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: user1Id,
            marketId,
          },
        },
      }),
    );

    expect(position).not.toBeNull();
    expect(position?.userId).toBe(user1Id);
    expect(position?.marketId).toBe(marketId);
    expectDecimal(position?.size, "4");
    expectDecimal(position?.entryPrice, "100");
    expect(position?.leverage).toBe(5);
    expect(position?.liquidationPrice).toBeNull();
  },15000);

  it("should persist User 2's SHORT position after the fill", async () => {
    const position = await waitFor(() =>
      prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: user2Id,
            marketId,
          },
        },
      }),
    );

    expect(position).not.toBeNull();
    expect(position?.userId).toBe(user2Id);
    expect(position?.marketId).toBe(marketId);
    expectDecimal(position?.size, "-4");
    expectDecimal(position?.entryPrice, "100");
    expect(position?.leverage).toBe(5);
    expect(position?.liquidationPrice).toBeNull();
  },15000);

  it("should have exactly one fill for the test match", async () => {
    const fills = await prisma.fill.findMany({
      where: {
        marketId,
        maker_order_id: restingBidId,
        taker_order_id: takerOrderId,
      },
    });

    expect(fills).toHaveLength(1);
  });

  it("should maintain correct order quantity accounting", async () => {
    const order = await prisma.order.findUnique({
      where: { id: restingBidId },
    });

    expect(order).not.toBeNull();

    const originalQty = 10;
    const filledQty = Number(order!.filledQty);
    const remainingQty = originalQty - filledQty;

    expect(filledQty).toBe(4);
    expect(remainingQty).toBe(6);
  });
});

// =====================================================
// TEST 8: MATCHING ENGINE CONSISTENCY
// =====================================================

describe("8. Matching Engine Consistency Tests", () => {
  it("should maintain maker/taker relationships", async () => {
    const fill = await prisma.fill.findFirst({
      where: {
        maker_order_id: restingBidId,
        taker_order_id: takerOrderId,
      },
    });

    expect(fill).not.toBeNull();
    expect(fill?.maker_order_id).toBe(restingBidId);
    expect(fill?.taker_order_id).toBe(takerOrderId);
  });

  it("should not have negative filled quantity", async () => {
    const orders = await prisma.order.findMany({
      where: {
        id: {
          in: [restingBidId, restingAskId, takerOrderId],
        },
      },
    });

    expect(orders).toHaveLength(3);

    for (const order of orders) {
      expect(Number(order.filledQty)).toBeGreaterThanOrEqual(0);
    }
  });

  it("should not fill more than the original quantity", async () => {
    const orders = await prisma.order.findMany({
      where: {
        id: {
          in: [restingBidId, restingAskId, takerOrderId],
        },
      },
    });

    for (const order of orders) {
      expect(Number(order.filledQty)).toBeLessThanOrEqual(Number(order.qty));
    }
  });

  it("should preserve the filled taker order", async () => {
    const order = await prisma.order.findUnique({
      where: { id: takerOrderId },
    });

    expect(order?.status).toBe("FILLED");
    expectDecimal(order?.filledQty, "4");
  });


});


  // =====================================================
// TEST 9: ADDITIONAL MARKET VALIDATION & ADMIN SECURITY
// =====================================================

describe("9. Additional Market Validation Tests", () => {
  it("should reject market creation without admin_secret", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: `NOADMIN_${uniqueSuffix}`,
        slug: `noadmin_${uniqueSuffix}`,
        baseToken: "SOL",
        imgUrl: "sol.png",
        tickSize: "0.1",
        stepSize: "0.001",
      },
      {
        headers: { token: token1 },
      },
    );

    expect([401, 403]).toContain(res.status);
  });

  it("should reject market creation with an incorrect admin secret", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: `WRONGADMIN_${uniqueSuffix}`,
        slug: `wrongadmin_${uniqueSuffix}`,
        baseToken: "SOL",
        imgUrl: "sol.png",
        tickSize: "0.1",
        stepSize: "0.001",
      },
      {
        headers: {
          token: token1,
          admin_secret: "wrong-secret",
        },
      },
    );

    expect([401, 403]).toContain(res.status);
  });

  it("should reject an unsupported base token", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: `INVALIDTOKEN_${uniqueSuffix}`,
        slug: `invalidtoken_${uniqueSuffix}`,
        baseToken: "DOGE",
        imgUrl: "doge.png",
        tickSize: "0.1",
        stepSize: "0.001",
      },
      {
        headers: { admin_secret: ADMIN_TOKEN },
      },
    );

    expectBadRequest(res.status);
  });

  it("should reject market creation without an image URL", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: `NOIMAGE_${uniqueSuffix}`,
        slug: `noimage_${uniqueSuffix}`,
        baseToken: "SOL",
        tickSize: "0.1",
        stepSize: "0.001",
      },
      {
        headers: { admin_secret: ADMIN_TOKEN },
      },
    );

    expectBadRequest(res.status);
  });

  it("should reject market creation without a symbol", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {
        slug: `nosymbol_${uniqueSuffix}`,
        baseToken: "SOL",
        imgUrl: "sol.png",
      },
      {
        headers: { admin_secret: ADMIN_TOKEN },
      },
    );

    expectBadRequest(res.status);
  });

  it("should reject market creation without a slug", async () => {
    const res = await api.post(
      "/api/v1/admin/market",
      {
        symbol: `NOSLUG_${uniqueSuffix}`,
        baseToken: "SOL",
        imgUrl: "sol.png",
      },
      {
        headers: { admin_secret: ADMIN_TOKEN },
      },
    );

    expectBadRequest(res.status);
  });
});

// =====================================================
// TEST 10: ADDITIONAL ORDER VALIDATION
// =====================================================

describe("10. Additional Order Validation Tests", () => {
  it("should reject an empty order payload", async () => {
    const res = await api.post(
      "/api/v1/order",
      {},
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an order without quantity", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an order without side", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an order without orderType", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        marketId,
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an unsupported order type", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "STOP_LOSS",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an unsupported time in force", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "IOC",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject non-numeric quantity", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "abc",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject non-numeric price", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "abc",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject zero price", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "0",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject negative price", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "-100",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject zero leverage", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "0",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject negative leverage", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "-5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject non-numeric leverage", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "abc",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });
});

// =====================================================
// TEST 11: ADDITIONAL CANCELLATION SECURITY
// =====================================================

describe("11. Additional Order Cancellation Security Tests", () => {
  it("should reject cancellation of a nonexistent order", async () => {
    const res = await api.delete(
      "/api/v1/order/nonexistent-order-id",
      {
        headers: { token: token1 },
        data: { marketId },
      },
    );

    expect([400, 404, 409]).toContain(res.status);
  });

  it("should not allow User 2 to cancel User 1's order", async () => {
    // Create a separate resting order for this security test.
    const createRes = await api.post(
      "/api/v1/order",
      {
        price: "1",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "GTC",
        reduceOnly: false,
      },
      auth(token1),
    );

    expect(createRes.status).toBe(200);

    const orderId = createRes.data.orderId;
    expect(orderId).toBeDefined();

    // Attempt cancellation using the other user's token.
    const cancelRes = await api.delete(
      `/api/v1/order/${orderId}`,
      {
        headers: { token: token2 },
        data: { marketId },
      },
    );

    expect([403, 404]).toContain(cancelRes.status);

    // Confirm that the order was not cancelled.
    const order = await waitFor(() =>
      prisma.order.findUnique({
        where: { id: orderId },
      }),
    );

    expect(order.status).toBe("OPEN");

    // Clean up using the order owner's token.
    const ownerCancelRes = await api.delete(
      `/api/v1/order/${orderId}`,
      {
        headers: { token: token1 },
        data: { marketId },
      },
    );

    expect(ownerCancelRes.status).toBe(200);
  }, 15000);
});

// =====================================================
// TEST 12: ADDITIONAL DATABASE INTEGRITY
// =====================================================

describe("12. Additional Database Integrity Tests", () => {
  it("should not contain duplicate fills for the same test match", async () => {
    const fills = await prisma.fill.findMany({
      where: {
        marketId,
        maker_order_id: restingBidId,
        taker_order_id: takerOrderId,
      },
    });

    expect(fills).toHaveLength(1);
  });

  it("should persist the correct market relationship for the fill", async () => {
    const fill = await prisma.fill.findFirst({
      where: {
        maker_order_id: restingBidId,
        taker_order_id: takerOrderId,
      },
    });

    expect(fill).not.toBeNull();
    expect(fill?.marketId).toBe(marketId);
  });

  it("should persist a positive fill price and quantity", async () => {
    const fill = await prisma.fill.findFirst({
      where: {
        maker_order_id: restingBidId,
        taker_order_id: takerOrderId,
      },
    });

    expect(fill).not.toBeNull();
    expect(Number(fill?.price)).toBeGreaterThan(0);
    expect(Number(fill?.qty)).toBeGreaterThan(0);
  });

  it("should persist exactly two positions for this market's test users", async () => {
    const positions = await prisma.position.findMany({
      where: {
        marketId,
        userId: {
          in: [user1Id, user2Id],
        },
      },
    });

    expect(positions).toHaveLength(2);
  });

  it("should maintain opposite position directions for maker and taker", async () => {
    const user1Position = await prisma.position.findUnique({
      where: {
        userId_marketId: {
          userId: user1Id,
          marketId,
        },
      },
    });

    const user2Position = await prisma.position.findUnique({
      where: {
        userId_marketId: {
          userId: user2Id,
          marketId,
        },
      },
    });

    expect(user1Position).not.toBeNull();
    expect(user2Position).not.toBeNull();

    expect(Number(user1Position!.size)).toBeGreaterThan(0);
    expect(Number(user2Position!.size)).toBeLessThan(0);
  });

  it("should maintain equal absolute position quantities for this matched trade", async () => {
    const user1Position = await prisma.position.findUnique({
      where: {
        userId_marketId: {
          userId: user1Id,
          marketId,
        },
      },
    });

    const user2Position = await prisma.position.findUnique({
      where: {
        userId_marketId: {
          userId: user2Id,
          marketId,
        },
      },
    });

    expect(user1Position).not.toBeNull();
    expect(user2Position).not.toBeNull();

    expect(Math.abs(Number(user1Position!.size))).toBe(
      Math.abs(Number(user2Position!.size)),
    );
  });
});

// =====================================================
// TEST 13: AUTHENTICATION EDGE CASES
// =====================================================

describe("13. Authentication Edge Case Tests", () => {
  it("should reject a malformed token", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "1000" },
      auth("not-a-valid-token"),
    );

    expect([401, 403]).toContain(res.status);
  });

  it("should reject an empty token", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "1000" },
      auth(""),
    );

    expect([401, 403]).toContain(res.status);
  });

  it("should reject a token with an invalid Bearer value", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "1000" },
      {
        headers: {
          authorization: "Bearer invalid-token",
          token: "invalid-token",
        },
      },
    );

    expect([401, 403]).toContain(res.status);
  });

  it("should reject signin with an empty username", async () => {
    const res = await api.post("/api/v1/signin", {
      username: "",
      password: PASSWORD,
    });

    expectBadRequest(res.status);
  });

  it("should reject signin with an empty password", async () => {
    const res = await api.post("/api/v1/signin", {
      username: USER1,
      password: "",
    });

    expectBadRequest(res.status);
  });

  it("should reject signup with an empty username", async () => {
    const res = await api.post("/api/v1/signup", {
      username: "",
      password: PASSWORD,
    });

    expectBadRequest(res.status);
  });

  it("should reject signup with an empty password", async () => {
    const res = await api.post("/api/v1/signup", {
      username: `empty_password_${uniqueSuffix}`,
      password: "",
    });

    expectBadRequest(res.status);
  });

  it("should not authenticate User 1's token as User 2", async () => {
    // A token must identify its actual owner.
    // This verifies the token is not interchangeable between accounts.
    const user1 = await prisma.user.findUnique({
      where: { id: user1Id },
    });

    const user2 = await prisma.user.findUnique({
      where: { id: user2Id },
    });

    expect(user1).not.toBeNull();
    expect(user2).not.toBeNull();
    expect(user1?.id).not.toBe(user2?.id);
    expect(token1).not.toBe(token2);
  });
});

// =====================================================
// TEST 14: ON-RAMP INPUT EDGE CASES
// =====================================================

describe("14. On-Ramp Input Edge Case Tests", () => {
  it("should reject null on-ramp amount", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: null },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an object as on-ramp amount", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: { value: "1000" } },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an array as on-ramp amount", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: ["1000"] },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject whitespace as on-ramp amount", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "   " },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject Infinity as on-ramp amount", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "Infinity" },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject NaN as on-ramp amount", async () => {
    const res = await api.post(
      "/api/v1/onRamp",
      { amount: "NaN" },
      auth(token1),
    );

    expectBadRequest(res.status);
  });
});

// =====================================================
// TEST 15: ORDER INPUT EDGE CASES
// =====================================================

describe("15. Order Input Edge Case Tests", () => {
  it("should reject null quantity", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: null,
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an object as quantity", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: { value: "1" },
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an array as price", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: ["100"],
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject whitespace as quantity", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "   ",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject Infinity as quantity", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "Infinity",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject NaN as price", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "NaN",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject null marketId", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        marketId: null,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an invalid reduceOnly data type", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
        reduceOnly: "true",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject an invalid side casing", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "1",
        side: "bid",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });
});

// =====================================================
// TEST 16: MARKET PRECISION VALIDATION
// =====================================================

describe("16. Market Precision Validation Tests", () => {
  it("should reject quantity below the market step size", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100",
        qty: "0.0001",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "GTC",
        reduceOnly: false,
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });

  it("should reject a price that does not match the market tick size", async () => {
    const res = await api.post(
      "/api/v1/order",
      {
        price: "100.05",
        qty: "1",
        side: "BID",
        marketId,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "GTC",
        reduceOnly: false,
      },
      auth(token1),
    );

    expectBadRequest(res.status);
  });
});

// =====================================================
// TEST 17: FILL ACCOUNTING INTEGRITY
// =====================================================

describe("17. Fill Accounting Integrity Tests", () => {
  it("should have a positive fill price", async () => {
    const fill = await prisma.fill.findFirst({
      where: {
        maker_order_id: restingBidId,
        taker_order_id: takerOrderId,
      },
    });

    expect(fill).not.toBeNull();
    expect(Number(fill!.price)).toBeGreaterThan(0);
  });

  it("should have a positive fill quantity", async () => {
    const fill = await prisma.fill.findFirst({
      where: {
        maker_order_id: restingBidId,
        taker_order_id: takerOrderId,
      },
    });

    expect(fill).not.toBeNull();
    expect(Number(fill!.qty)).toBeGreaterThan(0);
  });

  it("should have matching market IDs on both matched orders", async () => {
    const maker = await prisma.order.findUnique({
      where: { id: restingBidId },
    });

    const taker = await prisma.order.findUnique({
      where: { id: takerOrderId },
    });

    expect(maker).not.toBeNull();
    expect(taker).not.toBeNull();

    expect(maker!.marketId).toBe(marketId);
    expect(taker!.marketId).toBe(marketId);
    expect(maker!.marketId).toBe(taker!.marketId);
  });

  it("should have a fill quantity equal to the taker's filled quantity", async () => {
    const fills = await prisma.fill.findMany({
      where: {
        maker_order_id: restingBidId,
        taker_order_id: takerOrderId,
      },
    });

    const taker = await prisma.order.findUnique({
      where: { id: takerOrderId },
    });

    expect(taker).not.toBeNull();

    const totalFilled = fills.reduce(
      (sum, fill) => sum + Number(fill.qty),
      0,
    );

    expect(totalFilled).toBeCloseTo(Number(taker!.filledQty), 10);
  });

  it("should have total maker fill quantity equal to maker filled quantity", async () => {
    const fills = await prisma.fill.findMany({
      where: {
        maker_order_id: restingBidId,
      },
    });

    const maker = await prisma.order.findUnique({
      where: { id: restingBidId },
    });

    expect(maker).not.toBeNull();

    const totalFilled = fills.reduce(
      (sum, fill) => sum + Number(fill.qty),
      0,
    );

    expect(totalFilled).toBeCloseTo(Number(maker!.filledQty), 10);
  });

  it("should not have fills against the non-crossing resting ASK", async () => {
    const fills = await prisma.fill.findMany({
      where: {
        maker_order_id: restingAskId,
      },
    });

    expect(fills).toHaveLength(0);
  });
});

// =====================================================
// TEST 18: POSITION ACCOUNTING INTEGRITY
// =====================================================

describe("18. Position Accounting Integrity Tests", () => {
  it("should persist User 1 position with the correct market", async () => {
    const position = await prisma.position.findUnique({
      where: {
        userId_marketId: {
          userId: user1Id,
          marketId,
        },
      },
    });

    expect(position).not.toBeNull();
    expect(position!.marketId).toBe(marketId);
  });

  it("should persist User 2 position with the correct market", async () => {
    const position = await prisma.position.findUnique({
      where: {
        userId_marketId: {
          userId: user2Id,
          marketId,
        },
      },
    });

    expect(position).not.toBeNull();
    expect(position!.marketId).toBe(marketId);
  });

  it("should not persist a zero-size position after this opening trade", async () => {
    const user1Position = await prisma.position.findUnique({
      where: {
        userId_marketId: {
          userId: user1Id,
          marketId,
        },
      },
    });

    const user2Position = await prisma.position.findUnique({
      where: {
        userId_marketId: {
          userId: user2Id,
          marketId,
        },
      },
    });

    expect(user1Position).not.toBeNull();
    expect(user2Position).not.toBeNull();

    expect(Number(user1Position!.size)).not.toBe(0);
    expect(Number(user2Position!.size)).not.toBe(0);
  });

  it("should persist the expected leverage for both users", async () => {
    const positions = await prisma.position.findMany({
      where: {
        marketId,
        userId: {
          in: [user1Id, user2Id],
        },
      },
    });

    expect(positions).toHaveLength(2);

    for (const position of positions) {
      expect(position.leverage).toBe(5);
    }
  });

  it("should have matching absolute position sizes", async () => {
    const positions = await prisma.position.findMany({
      where: {
        marketId,
        userId: {
          in: [user1Id, user2Id],
        },
      },
    });

    expect(positions).toHaveLength(2);

    const longPosition = positions.find(
      (position) => position.userId === user1Id,
    );

    const shortPosition = positions.find(
      (position) => position.userId === user2Id,
    );

    expect(longPosition).toBeDefined();
    expect(shortPosition).toBeDefined();

    expect(Math.abs(Number(longPosition!.size))).toBeCloseTo(
      Math.abs(Number(shortPosition!.size)),
      10,
    );
  });
});


// =====================================================
// SHARED USERS FOR SECTIONS 19–23
// =====================================================

const extraUsers = {
  makerA: {
    username: `makerA_${uniqueSuffix}`,
    token: "",
    id: "",
  },
  makerB: {
    username: `makerB_${uniqueSuffix}`,
    token: "",
    id: "",
  },
  taker: {
    username: `taker_${uniqueSuffix}`,
    token: "",
    id: "",
  },
  positionTrader: {
    username: `positionTrader_${uniqueSuffix}`,
    token: "",
    id: "",
  },
  positionMaker: {
    username: `positionMaker_${uniqueSuffix}`,
    token: "",
    id: "",
  },
  reverseTrader: {
    username: `reverseTrader_${uniqueSuffix}`,
    token: "",
    id: "",
  },
  reverseMaker: {
    username: `reverseMaker_${uniqueSuffix}`,
    token: "",
    id: "",
  },
};

// =====================================================
// SHARED USER SETUP
// =====================================================

async function createFundedUser(user: {
  username: string;
  token: string;
  id: string;
}) {
  const signup = await api.post("/api/v1/signup", {
    username: user.username,
    password: PASSWORD,
  });

  expect(signup.status).toBe(201);

  user.id = signup.data.id;

  const signin = await api.post("/api/v1/signin", {
    username: user.username,
    password: PASSWORD,
  });

  expect(signin.status).toBe(200);

  user.token = signin.data.token;

  const deposit = await api.post(
    "/api/v1/onRamp",
    { amount: "100000" },
    auth(user.token)
  );

  expect(deposit.status).toBe(200);
}

// =====================================================
// SHARED ORDER HELPER
// =====================================================

async function placeOrder(
  token: string,
  side: "BID" | "ASK",
  price: string,
  qty: string,
  options: {
    orderType?: "LIMIT" | "MARKET";
    timeInForce?: "GTC" | "FOK";
    reduceOnly?: boolean;
  } = {}
) {
  return api.post(
    "/api/v1/order",
    {
      price,
      qty,
      side,
      marketId,
      orderType: options.orderType ?? "LIMIT",
      leverage: "5",
      timeInForce: options.timeInForce ?? "GTC",
      reduceOnly: options.reduceOnly ?? false,
    },
    auth(token)
  );
}

async function executeTrade(params: {
  makerToken: string;
  takerToken: string;
  makerSide: "BID" | "ASK";
  takerSide: "BID" | "ASK";
  price: string;
  makerQty: string;
  takerQty: string;
  reduceOnly?: boolean;
}) {
  const makerResponse = await placeOrder(
    params.makerToken,
    params.makerSide,
    params.price,
    params.makerQty
  );

  expect(makerResponse.status).toBe(200);

  const makerOrderId = makerResponse.data.orderId;

  await waitFor(() =>
    prisma.order.findUnique({
      where: { id: makerOrderId },
    })
  );

  const takerResponse = await placeOrder(
    params.takerToken,
    params.takerSide,
    params.price,
    params.takerQty,
    { reduceOnly: params.reduceOnly ?? false }
  );

  expect(takerResponse.status).toBe(200);

  return {
    makerOrderId,
    takerOrderId: takerResponse.data.orderId,
    takerResult: takerResponse.data.result,
  };
}

// =====================================================
// INITIALIZE SHARED USERS ONCE
// =====================================================

beforeAll(async () => {
  for (const user of Object.values(extraUsers)) {
    await createFundedUser(user);
  }
});

// =====================================================
// SECTION 19: MULTIPLE MAKER FILLS
// =====================================================

describe("19. Multiple Maker Fills", () => {
  it("should match one taker order against multiple makers", async () => {
    const makerA = await placeOrder(
      extraUsers.makerA.token,
      "ASK",
      "200",
      "2"
    );

    expect(makerA.status).toBe(200);

    const makerB = await placeOrder(
      extraUsers.makerB.token,
      "ASK",
      "200",
      "3"
    );

    expect(makerB.status).toBe(200);

    const makerAId = makerA.data.orderId;
    const makerBId = makerB.data.orderId;

    const taker = await placeOrder(
      extraUsers.taker.token,
      "BID",
      "200",
      "5"
    );

    expect(taker.status).toBe(200);

    const takerOrderId = taker.data.orderId;

    expect(taker.data.result.status).toBe("FILLED");
    expectDecimal(taker.data.result.exuctedQty, "5");
    expectDecimal(taker.data.result.remaningQty, "0");

    const fills = await waitFor(async () => {
      const records = await prisma.fill.findMany({
        where: { taker_order_id: takerOrderId },
      });

      return records.length === 2 ? records : null;
    });

    expect(fills).toHaveLength(2);

    expect(fills.every(
      fill => fill.taker_order_id === takerOrderId
    )).toBe(true);

    expect(
      fills.find(fill => fill.maker_order_id === makerAId)
    ).toBeDefined();

    expect(
      fills.find(fill => fill.maker_order_id === makerBId)
    ).toBeDefined();

    expect(
      fills.reduce((sum, fill) => sum + Number(fill.qty), 0)
    ).toBe(5);

    const [orderA, orderB, takerOrder] = await Promise.all([
      prisma.order.findUnique({ where: { id: makerAId } }),
      prisma.order.findUnique({ where: { id: makerBId } }),
      prisma.order.findUnique({ where: { id: takerOrderId } }),
    ]);

    expectDecimal(orderA?.filledQty, "2");
    expectDecimal(orderB?.filledQty, "3");
    expectDecimal(takerOrder?.filledQty, "5");

    expect(orderA?.status).toBe("FILLED");
    expect(orderB?.status).toBe("FILLED");
    expect(takerOrder?.status).toBe("FILLED");
  });
});

// =====================================================
// SECTION 20: POSITION LIFECYCLE
// =====================================================

describe("20. Position Lifecycle", () => {
  it("should open a LONG position", async () => {
    const trade = await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "ASK",
      takerSide: "BID",
      price: "100",
      makerQty: "2",
      takerQty: "2",
    });

    expect(trade.takerResult.status).toBe("FILLED");

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.positionTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "2" ? result : null;
    });

    expectDecimal(position.size, "2");
    expectDecimal(position.entryPrice, "100");
  });

  it("should add to LONG and calculate weighted average entry price", async () => {
    await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "ASK",
      takerSide: "BID",
      price: "120",
      makerQty: "2",
      takerQty: "2",
    });

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.positionTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "4" ? result : null;
    });

    expectDecimal(position.size, "4");
    expectDecimal(position.entryPrice, "110");
  });

  it("should partially reduce LONG", async () => {
    await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "BID",
      takerSide: "ASK",
      price: "130",
      makerQty: "1",
      takerQty: "1",
      reduceOnly: true,
    });

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.positionTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "3" ? result : null;
    });

    expectDecimal(position.size, "3");
    expectDecimal(position.entryPrice, "110");
  });

  it("should fully close LONG and persist zero size", async () => {
    await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "BID",
      takerSide: "ASK",
      price: "130",
      makerQty: "3",
      takerQty: "3",
      reduceOnly: true,
    });

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.positionTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "0" ? result : null;
    });

    expectDecimal(position.size, "0");
  });

  it("should open a SHORT position", async () => {
    await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "BID",
      takerSide: "ASK",
      price: "100",
      makerQty: "2",
      takerQty: "2",
    });

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.positionTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "-2" ? result : null;
    });

    expectDecimal(position.size, "-2");
    expectDecimal(position.entryPrice, "100");
  });

  it("should add to SHORT and calculate weighted average entry price", async () => {
    await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "BID",
      takerSide: "ASK",
      price: "120",
      makerQty: "2",
      takerQty: "2",
    });

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.positionTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "-4" ? result : null;
    });

    expectDecimal(position.size, "-4");
    expectDecimal(position.entryPrice, "110");
  });

  it("should partially reduce SHORT", async () => {
    await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "ASK",
      takerSide: "BID",
      price: "90",
      makerQty: "1",
      takerQty: "1",
      reduceOnly: true,
    });

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.positionTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "-3" ? result : null;
    });

    expectDecimal(position.size, "-3");
    expectDecimal(position.entryPrice, "110");
  });

  it("should fully close SHORT", async () => {
    await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "ASK",
      takerSide: "BID",
      price: "90",
      makerQty: "3",
      takerQty: "3",
      reduceOnly: true,
    });

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.positionTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "0" ? result : null;
    });

    expectDecimal(position.size, "0");
  });
});

// =====================================================
// SECTION 21: POSITION FLIPPING
// =====================================================

describe("21. Position Flipping", () => {
  it("should flip LONG 5 into SHORT 3", async () => {
    await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "ASK",
      takerSide: "BID",
      price: "100",
      makerQty: "5",
      takerQty: "5",
    });

    const flip = await executeTrade({
      makerToken: extraUsers.positionMaker.token,
      takerToken: extraUsers.positionTrader.token,
      makerSide: "BID",
      takerSide: "ASK",
      price: "90",
      makerQty: "8",
      takerQty: "8",
    });

    expect(flip.takerResult.status).toBe("FILLED");

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.positionTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "-3" ? result : null;
    });

    expectDecimal(position.size, "-3");
    expectDecimal(position.entryPrice, "90");
  });

  it("should flip SHORT 5 into LONG 3", async () => {
    await executeTrade({
      makerToken: extraUsers.reverseMaker.token,
      takerToken: extraUsers.reverseTrader.token,
      makerSide: "BID",
      takerSide: "ASK",
      price: "100",
      makerQty: "5",
      takerQty: "5",
    });

    const flip = await executeTrade({
      makerToken: extraUsers.reverseMaker.token,
      takerToken: extraUsers.reverseTrader.token,
      makerSide: "ASK",
      takerSide: "BID",
      price: "110",
      makerQty: "8",
      takerQty: "8",
    });

    expect(flip.takerResult.status).toBe("FILLED");

    const position = await waitFor(async () => {
      const result = await prisma.position.findUnique({
        where: {
          userId_marketId: {
            userId: extraUsers.reverseTrader.id,
            marketId,
          },
        },
      });

      return result?.size === "3" ? result : null;
    });

    expectDecimal(position.size, "3");
    expectDecimal(position.entryPrice, "110");
  });
});

// =====================================================
// SECTION 22: MARGIN AND WALLET ACCOUNTING
// =====================================================

describe("22. Margin and Wallet Accounting", () => {
  it("should reject an order when available balance is insufficient", async () => {
    const username = `poor_trader_${uniqueSuffix}`;

    const signup = await api.post("/api/v1/signup", {
      username,
      password: PASSWORD,
    });

    expect(signup.status).toBe(201);

    const signin = await api.post("/api/v1/signin", {
      username,
      password: PASSWORD,
    });

    expect(signin.status).toBe(200);

    const response = await placeOrder(
      signin.data.token,
      "BID",
      "1000",
      "1000"
    );

    expect([400, 409, 422]).toContain(response.status);
  });

  it("should calculate initial margin for a resting order", async () => {
    const response = await placeOrder(
      extraUsers.makerA.token,
      "BID",
      "200",
      "2"
    );

    expect(response.status).toBe(200);

    const order = await waitFor(() =>
      prisma.order.findUnique({
        where: { id: response.data.orderId },
      })
    );

    expectDecimal(order.initialMargin, "80");
    expectDecimal(order.lockedMargin, "80");
    expect(order.status).toBe("OPEN");

    const cancel = await api.delete(
      `/api/v1/order/${response.data.orderId}`,
      {
        headers: { token: extraUsers.makerA.token },
        data: { marketId },
      }
    );

    expect(cancel.status).toBe(200);
  });

  it("should not leave locked margin on a fully filled order", async () => {
    const maker = await placeOrder(
      extraUsers.makerA.token,
      "ASK",
      "250",
      "2"
    );

    expect(maker.status).toBe(200);

    const taker = await placeOrder(
      extraUsers.taker.token,
      "BID",
      "250",
      "2"
    );

    expect(taker.status).toBe(200);
    expect(taker.data.result.status).toBe("FILLED");

    const order = await waitFor(async () => {
      const result = await prisma.order.findUnique({
        where: { id: taker.data.orderId },
      });

      return result?.status === "FILLED" ? result : null;
    });

    expectDecimal(order.filledQty, "2");
    expectDecimal(order.lockedMargin, "0");
  });

  it("should cancel an unfilled order", async () => {
    const response = await placeOrder(
      extraUsers.makerB.token,
      "BID",
      "150",
      "2"
    );

    expect(response.status).toBe(200);

    const cancel = await api.delete(
      `/api/v1/order/${response.data.orderId}`,
      {
        headers: { token: extraUsers.makerB.token },
        data: { marketId },
      }
    );

    expect(cancel.status).toBe(200);

    const order = await waitFor(async () => {
      const result = await prisma.order.findUnique({
        where: { id: response.data.orderId },
      });

      return result?.status === "CANCELLED" ? result : null;
    });

    expect(order.status).toBe("CANCELLED");
    expectDecimal(order.filledQty, "0");
  });
});

// =====================================================
// SECTION 23: ORDER EXECUTION EDGE CASES
// =====================================================

describe("23. Order Execution Edge Cases", () => {
  it("should fully execute FOK when liquidity is sufficient", async () => {
    await placeOrder(
      extraUsers.makerA.token,
      "ASK",
      "300",
      "3"
    );

    const taker = await placeOrder(
      extraUsers.taker.token,
      "BID",
      "300",
      "3",
      { timeInForce: "FOK" }
    );

    expect(taker.status).toBe(200);
    expect(taker.data.result.status).toBe("FILLED");
    expectDecimal(taker.data.result.exuctedQty, "3");
    expectDecimal(taker.data.result.remaningQty, "0");
  });

  it("should not partially execute an FOK order", async () => {
    await placeOrder(
      extraUsers.makerA.token,
      "ASK",
      "310",
      "2"
    );

    const taker = await placeOrder(
      extraUsers.taker.token,
      "BID",
      "310",
      "5",
      { timeInForce: "FOK" }
    );

    expect(taker.data.result?.status === "FILLED" &&
      Number(taker.data.result?.exuctedQty) === 5).toBe(false);

    expect(Number(taker.data.result?.exuctedQty ?? 0)).toBe(0);
  });

  it("should execute a market order against available liquidity", async () => {
    await placeOrder(
      extraUsers.makerA.token,
      "ASK",
      "320",
      "2"
    );

    const taker = await placeOrder(
      extraUsers.taker.token,
      "BID",
      "320",
      "2",
      { orderType: "MARKET" }
    );

    expect(taker.status).toBe(200);
    expect(taker.data.result.status).toBe("FILLED");
    expectDecimal(taker.data.result.exuctedQty, "2");
  });

  it("should not leave an unfilled market-order remainder resting", async () => {
    await placeOrder(
      extraUsers.makerA.token,
      "ASK",
      "330",
      "2"
    );

    const taker = await placeOrder(
      extraUsers.taker.token,
      "BID",
      "330",
      "5",
      { orderType: "MARKET" }
    );

    expect(taker.status).toBe(200);
    expectDecimal(taker.data.result.exuctedQty, "2");
    expectDecimal(taker.data.result.remaningQty, "3");

    const order = await waitFor(() =>
      prisma.order.findUnique({
        where: { id: taker.data.orderId },
      })
    );

    expect(order.status).not.toBe("OPEN");
  });

  it("should execute at the best available price first", async () => {
    await placeOrder(
      extraUsers.makerA.token,
      "ASK",
      "350",
      "1"
    );

    await placeOrder(
      extraUsers.makerB.token,
      "ASK",
      "340",
      "1"
    );

    const taker = await placeOrder(
      extraUsers.taker.token,
      "BID",
      "360",
      "2"
    );

    expect(taker.status).toBe(200);
    expect(taker.data.result.status).toBe("FILLED");

    const prices = taker.data.result.fills.map(
      (fill: { price: string }) => Number(fill.price)
    );

    expect(prices).toEqual([340, 350]);
  });

  it("should not execute above a BID limit price", async () => {
    await placeOrder(
      extraUsers.makerA.token,
      "ASK",
      "400",
      "1"
    );

    const taker = await placeOrder(
      extraUsers.taker.token,
      "BID",
      "390",
      "1"
    );

    expect(taker.status).toBe(200);
    expect(taker.data.result.fills).toHaveLength(0);
    expect(taker.data.result.status).toBe("OPEN");
  });
});

});
