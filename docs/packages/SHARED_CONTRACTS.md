# Shared Inter-Process Contracts

This document summarizes the contractual agreements between distributed microservices across the Perps monorepo.

---

## 1. REST Request & Response Contracts

```typescript
// Order Creation (Client -> Backend)
interface CreateOrderRequest {
  marketId: string;
  side: "BID" | "ASK";
  orderType: "LIMIT" | "MARKET";
  qty: string;
  price?: string;
  leverage?: number;
  timeInForce?: "GTC" | "FOK";
  reduceOnly?: boolean;
}

// Order Creation Response (Backend -> Client)
interface CreateOrderResponse {
  orderId: string;
  message: string;
  result: {
    orderId: string;
    marketId: string;
    status: "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
    executedQty: string;
    remainingQty: string;
    fills: Array<{
      price: string;
      qty: string;
      makerUserId: string;
      makerOrderId: string;
      makerUserLeverage: string;
      makerMarginToRealase: string;
    }>;
  };
}
```

---

## 2. WebSocket Subscription Contracts

```typescript
// Subscribe to channels
interface WsSubscribePayload {
  action: "subscribe";
  channels: string[]; // ["depth:<symbol>", "trades:<symbol>"]
}

// Orderbook depth frame
interface WsDepthFrame {
  channel: string;
  data: {
    marketId: string;
    symbol: string;
    lastTradedPrice: string;
    bids: Array<[string, string]>; // [price, totalQty]
    asks: Array<[string, string]>; // [price, totalQty]
    timestamp: number;
  };
}

// Public trade frame
interface WsTradeFrame {
  channel: string;
  data: {
    type: "TRADE";
    marketId: string;
    fills: Array<{
      price: string;
      qty: string;
      timestamp: number;
    }>;
  };
}
```

---

## 3. Redis Stream Contract

```typescript
// Entry in Redis Stream 'engine'
interface EngineStreamRecord {
  loopbackId: string; // UUIDv7
  payload: string;    // Stringified toEngine JSON
}

// Entry in Redis Stream 'to-backend'
interface BackendStreamRecord {
  loopbackId: string;
  status: "SUCCESS" | "REJECTED" | "ERROR";
  data?: string;      // Stringified JSON
  error?: string;     // Error code (e.g. "INSUFFICIENT_BALANCE")
}
```
