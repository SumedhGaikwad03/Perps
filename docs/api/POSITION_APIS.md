# Position and Account APIs

File: [apps/backend/userRoutes/userRoutes.account.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/userRoutes/userRoutes.account.ts)

This module handles account synchronization, live in-memory snapshots, open orders, positions, and trade history.

*Note on Dual Mounting: In `apps/backend/index.ts`, `userRouter` is mounted at both `app.use("/api/v1/user", userRouter)` and `app.use("/api/v1", userRouter)`. Every endpoint in this document can be queried via either prefix.*

---

## 1. Live Engine Snapshot (`GET /api/v1/live` or `GET /api/v1/user/live`)

Retrieves the real-time, zero-lag in-memory snapshot of the user's balances, open positions, and resting orders directly from Redis Hashes.

* **Method**: `GET`
* **URL**: `/api/v1/live` (or `/api/v1/user/live`)
* **Authentication**: Required (`authmiddleware`)
* **Headers**: `token: <JWT>`

### Internal Processing Flow:
1. Concurrently fetches from Redis:
   - `redisClient.hGet("user:" + userId + ":balances", "data")`
   - `redisClient.hGetAll("user:" + userId + ":positions")`
   - `redisClient.hGetAll("user:" + userId + ":open_orders")`
2. Deserializes JSON payloads.
3. Returns aggregated account snapshot.

### Success Response (`200 OK`):
```json
{
  "message": "The postions and balances for the user is as follows bro",
  "status": "SUCESSS",
  "data": {
    "balances": {
      "available_bal": "9550.0",
      "locked_bal": "450.0"
    },
    "postions": [
      {
        "userId": "019318b7-6b22-7f32-843e-a4d32029c011",
        "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
        "side": "LONG",
        "qty": "0.5",
        "baseToken": "BTC",
        "entryPrice": "90000",
        "margin": "4500",
        "leverage": "10"
      }
    ],
    "openOrders": [
      {
        "orderId": "01934c90-5011-739c-8512-ab18593a9218",
        "userId": "019318b7-6b22-7f32-843e-a4d32029c011",
        "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
        "price": "88500",
        "qty": "1.0",
        "filledQty": "0",
        "orderSide": "BID",
        "orderType": "LIMIT",
        "status": "OPEN",
        "reduceOnly": false
      }
    ]
  }
}
```

---

## 2. Open Orders (`GET /api/v1/openOrders` or `GET /api/v1/user/openOrders`)

Pulls all resting orders currently in the orderbook for this user from Redis Hash `user:${userId}:open_orders`.

* **Method**: `GET`
* **URL**: `/api/v1/openOrders` (or `/api/v1/user/openOrders`)
* **Authentication**: Required (`authmiddleware`)

### Success Response (`200 OK`):
```json
{
  "status": "SUCCESS",
  "data": [
    {
      "orderId": "01934c90-5011-739c-8512-ab18593a9218",
      "userId": "019318b7-6b22-7f32-843e-a4d32029c011",
      "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
      "price": "88500",
      "qty": "1.0",
      "filledQty": "0.25",
      "orderSide": "BID",
      "orderType": "LIMIT",
      "status": "PARTIALLY_FILLED",
      "reduceOnly": false
    }
  ]
}
```

---

## 3. Order History (`GET /api/v1/orderHistory` or `GET /api/v1/user/orderHistory`)

Pulls closed historical orders (`status IN ['FILLED', 'CANCELLED']`) from PostgreSQL.

* **Method**: `GET`
* **URL**: `/api/v1/orderHistory` (or `/api/v1/user/orderHistory`)
* **Authentication**: Required (`authmiddleware`)

### Success Response (`200 OK`):
```json
{
  "status": "SUCCESS",
  "data": [
    {
      "id": "01934c89-1002-7102-a1b2-1981ab281901",
      "userId": "019318b7-6b22-7f32-843e-a4d32029c011",
      "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
      "orderType": "LIMIT",
      "orderSide": "BID",
      "price": "89000",
      "qty": "0.5",
      "filledQty": "0.5",
      "initialMargin": "4450",
      "lockedMargin": "0",
      "status": "FILLED",
      "timeInForce": "GTC",
      "reduceOnly": false,
      "createdAt": "2026-11-22T05:00:00.000Z",
      "updatedAt": "2026-11-22T05:02:15.000Z"
    }
  ]
}
```

---

## 4. Persisted Positions (`GET /api/v1/Positions` or `GET /api/v1/user/Positions`)

Retrieves the persisted positions for the user directly from PostgreSQL.

* **Method**: `GET`
* **URL**: `/api/v1/Positions` (or `/api/v1/user/Positions`)
* **Authentication**: Required (`authmiddleware`)

### Success Response (`200 OK`):
```json
{
  "status": "SUCCESS",
  "data": [
    {
      "id": "019318ba-1102-7a20-b001-aa1122334455",
      "userId": "019318b7-6b22-7f32-843e-a4d32029c011",
      "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
      "size": "0.5",
      "entryPrice": "90000",
      "leverage": 10,
      "liquidationPrice": "81000",
      "createdAt": "2026-11-20T10:00:00.000Z",
      "updatedAt": "2026-11-22T06:00:00.000Z"
    }
  ]
}
```
