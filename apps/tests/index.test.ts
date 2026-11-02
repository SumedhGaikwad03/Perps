import { BACKEND } from "./config";
import { describe, it, expect } from "bun:test";
import axios from "axios";

// Sequential E2E Lifecycle State
const User1 = `trader1_${Math.floor(Math.random() * 1000000)}`;
const User2 = `trader2_${Math.floor(Math.random() * 1000000)}`;
const Password = "securePassword123";

let token1 = "";
let token2 = "";
let user1Id = "";
let user2Id = "";
let MARKET_ID = "";
let user1RestingOrderId = "";
let user2RestingOrderId = "";

describe("1. Authentication Endpoints", () => {
  it("should create user 1", async () => {
    const res = await axios.post(`${BACKEND}/api/v1/signup`, {
      username: User1,
      password: Password,
    });
    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();
    user1Id = res.data.id;
  });

  it("should create user 2", async () => {
    const res = await axios.post(`${BACKEND}/api/v1/signup`, {
      username: User2,
      password: Password,
    });
    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();
    user2Id = res.data.id;
  });

  it("should sign in user 1 and issue JWT", async () => {
    const res = await axios.post(`${BACKEND}/api/v1/signin`, {
      username: User1,
      password: Password,
    });
    expect(res.status).toBe(200);
    expect(res.data.token).toBeDefined();
    token1 = res.data.token;
  });

  it("should sign in user 2 and issue JWT", async () => {
    const res = await axios.post(`${BACKEND}/api/v1/signin`, {
      username: User2,
      password: Password,
    });
    expect(res.status).toBe(200);
    expect(res.data.token).toBeDefined();
    token2 = res.data.token;
  });

  it("should reject sign in with incorrect password", async () => {
    const res = await axios.post(
      `${BACKEND}/api/v1/signin`,
      {
        username: User1,
        password: "incorrect_password_999",
      },
      { validateStatus: () => true }
    );
    expect(res.status).toBe(401);
  });

  it("should reject sign in for non-existent username", async () => {
    const res = await axios.post(
      `${BACKEND}/api/v1/signin`,
      {
        username: `ghost_${Date.now()}`,
        password: Password,
      },
      { validateStatus: () => true }
    );
    expect(res.status).toBe(401);
  });
});

describe("2. Admin Market Creation", () => {
  it("should create a new perpetual market via loopback", async () => {
    const symbol = `SOL_${Date.now()}`;
    const res = await axios.post(
      `${BACKEND}/api/v1/admin/market`,
      {
        symbol,
        slug: symbol.toLowerCase(),
        imgUrl: "sol.png",
        tickSize: "0.1",
        stepSize: "0.001",
      },
      {
        headers: {
          authorization: `Bearer ${token1}`,
          token: token1,
          "x-admin-token": "admin123",
          admin_secret: "admin123",
        },
      }
    );

    expect([200, 201]).toContain(res.status);
    expect(res.data.id).toBeDefined();
    MARKET_ID = res.data.id;
  }, 15000);
});

describe("3. Collateral On-Ramp", () => {
  it("should on-ramp balance for User 1", async () => {
    const res = await axios.post(
      `${BACKEND}/api/v1/onRamp`,
      { amount: "100000" },
      { headers: { token: token1 } }
    );
    expect(res.status).toBe(200);
    expect(res.data.message).toBe("onramp is done ");
  });

  it("should on-ramp balance for User 2", async () => {
    const res = await axios.post(
      `${BACKEND}/api/v1/onRamp`,
      { amount: "100000" },
      { headers: { token: token2 } }
    );
    expect(res.status).toBe(200);
    expect(res.data.message).toBe("onramp is done ");
  });
});

describe("4. Order Placement & Matching", () => {
  it("User 1 places a resting limit bid (sits on the book)", async () => {
    const res = await axios.post(
      `${BACKEND}/api/v1/order`,
      {
        price: "100",
        qty: "10",
        side: "BID",
        marketId: MARKET_ID,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "GTC",
        reduceOnly: false,
      },
      { headers: { token: token1 } }
    );

    expect(res.status).toBe(200);
    expect(res.data.orderId).toBeDefined();
    user1RestingOrderId = res.data.orderId;

    const result = res.data.result;
    expect(result.status).toBe("OPEN");
    expect(result.fills.length).toBe(0);
    expect(result.remaningQty).toBe("10");
  });

  it("User 2 places a resting limit ask above market (sits on the book)", async () => {
    const res = await axios.post(
      `${BACKEND}/api/v1/order`,
      {
        price: "105",
        qty: "5",
        side: "ASK",
        marketId: MARKET_ID,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "GTC",
        reduceOnly: false,
      },
      { headers: { token: token2 } }
    );

    expect(res.status).toBe(200);
    expect(res.data.orderId).toBeDefined();
    user2RestingOrderId = res.data.orderId;

    const result = res.data.result;
    expect(result.status).toBe("OPEN");
    expect(result.fills.length).toBe(0);
    expect(result.remaningQty).toBe("5");
  });

  it("User 2 places an aggressive ask matching User 1's bid partially", async () => {
    const res = await axios.post(
      `${BACKEND}/api/v1/order`,
      {
        price: "100",
        qty: "4",
        side: "ASK",
        marketId: MARKET_ID,
        orderType: "LIMIT",
        leverage: "5",
        timeInForce: "GTC",
        reduceOnly: false,
      },
      { headers: { token: token2 } }
    );

    expect(res.status).toBe(200);
    const result = res.data.result;
    expect(result.status).toBe("FILLED");
    expect(result.exuctedQty).toBe("4");
    expect(result.remaningQty).toBe("0");
    expect(result.fills.length).toBe(1);
    expect(result.fills[0].price).toBe("100");
    expect(result.fills[0].qty).toBe("4");
  });
});

describe("5. Order Cancellation - DELETE /api/v1/order/:orderId", () => {
  it("should fail with 404 if marketId is omitted from request body", async () => {
    const res = await axios.delete(
      `${BACKEND}/api/v1/order/${user1RestingOrderId}`,
      {
        headers: { token: token1 },
        data: {},
        validateStatus: () => true,
      }
    );
    expect(res.status).toBe(404);
    expect(res.data).toBe("Market_id or orderId is needed bro");
  });

  it("should reject cancel request if user is unauthenticated", async () => {
    const res = await axios.delete(
      `${BACKEND}/api/v1/order/${user1RestingOrderId}`,
      {
        data: { marketId: MARKET_ID },
        validateStatus: () => true,
      }
    );
    expect([401, 403]).toContain(res.status);
  });

  it("should reject cancellation if User 2 tries to cancel User 1's order", async () => {
    const res = await axios.delete(
      `${BACKEND}/api/v1/order/${user1RestingOrderId}`,
      {
        headers: { token: token2 },
        data: { marketId: MARKET_ID },
        validateStatus: () => true,
      }
    );
    expect(res.status).toBe(500);
    expect(res.data.error).toBe("Internal service error");
  });

  it("User 1 successfully cancels their remaining unfilled bid (6 units left)", async () => {
    const res = await axios.delete(
      `${BACKEND}/api/v1/order/${user1RestingOrderId}`,
      {
        headers: { token: token1 },
        data: { marketId: MARKET_ID },
      }
    );

    expect(res.status).toBe(200);
    expect(res.data.succes).toBe(true);
    expect(res.data.message).toBe("Order cancelled succesfully");

    const result = res.data.result;
    expect(result.status).toBe("CANCELLED");
    expect(result.orderId).toBe(user1RestingOrderId);
    expect(result.marketId).toBe(MARKET_ID);
    expect(parseFloat(result.unfilledQty)).toBe(6);
  });

  it("User 2 successfully cancels their resting ask order (5 units)", async () => {
    const res = await axios.delete(
      `${BACKEND}/api/v1/order/${user2RestingOrderId}`,
      {
        headers: { token: token2 },
        data: { marketId: MARKET_ID },
      }
    );

    expect(res.status).toBe(200);
    expect(res.data.succes).toBe(true);
    expect(res.data.result.status).toBe("CANCELLED");
    expect(parseFloat(res.data.result.unfilledQty)).toBe(5);
  });

  it("should fail when attempting to cancel an already cancelled order", async () => {
    const res = await axios.delete(
      `${BACKEND}/api/v1/order/${user1RestingOrderId}`,
      {
        headers: { token: token1 },
        data: { marketId: MARKET_ID },
        validateStatus: () => true,
      }
    );
    expect(res.status).toBe(500);
    expect(res.data.error).toBe("Internal service error");
  });
});
