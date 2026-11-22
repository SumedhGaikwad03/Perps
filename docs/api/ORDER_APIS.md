# Order APIs

File: [apps/backend/coreRoutes/order.routes.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/coreRoutes/order.routes.ts)

The Order module enables clients to submit Limit and Market orders, cancel resting orders, and execute emergency position square-offs.

---

## 1. Create Order (`POST /api/v1/order`)

Dispatches an order to the matching engine via Redis streams, executing against the orderbook or inserting as a resting maker order.

* **Method**: `POST`
* **URL**: `/api/v1/order`
* **Authentication**: Required (`authmiddleware`)
* **Headers**:
  - `token: <JWT>`
  - `Content-Type: application/json`

### Request Body:
| Field | Type | Required | Default | Description | Constraints |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `marketId` | string | Yes | — | Market UUID | Must match a valid registered market |
| `side` | string | Yes | — | Order side | Must be `"BID"` (Long) or `"ASK"` (Short) |
| `orderType` | string | Yes | — | Order execution style | Must be `"LIMIT"` or `"MARKET"` |
| `qty` | string / number | Yes | — | Order contract quantity | Finite, non-empty, > 0 |
| `price` | string / number | Semi | — | Limit price | **Required** if `orderType === "LIMIT"`. Positive finite number. |
| `leverage` | number | No | `1` | Order leverage | Finite number > 0 (typically 1 to 50) |
| `timeInForce` | string | No | `"GTC"` | Execution policy | `"GTC"` (Good 'Til Cancelled) or `"FOK"` (Fill Or Kill) |
| `reduceOnly` | boolean | No | `false` | Close-only constraint | If `true`, order can only reduce position size |

```json
{
  "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
  "side": "BID",
  "orderType": "LIMIT",
  "qty": "0.5",
  "price": "90000",
  "leverage": 10,
  "timeInForce": "GTC",
  "reduceOnly": false
}
```

### Internal Processing Flow:
1. `authmiddleware` validates `token` and injects `req.userId`.
2. Controller executes rigorous input bounds and type checking (rejecting null, object, boolean, array, non-finite, or non-positive values).
3. Generates monotonic `orderId = Bun.randomUUIDv7()`.
4. Queues `toEngine` message into `loopback({ messageType: "CREATE_ORDER", ... })`.
5. Redis Stream `engine` receives message. The matching engine matches against the orderbook.
6. If engine returns `status: "REJECTED"`, responds with HTTP 400 (or HTTP 404 if `"MARKET_NOT_FOUND_BRO"`).
7. If engine succeeds, returns HTTP 200 with the execution result.

### Success Response (`200 OK`):
```json
{
  "orderId": "01934c9b-6484-7a3b-9a81-cf5d5c148281",
  "message": "The engine has replayed with this",
  "result": {
    "orderId": "01934c9b-6484-7a3b-9a81-cf5d5c148281",
    "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
    "status": "FILLED",
    "executedQty": "0.5",
    "remainingQty": "0",
    "fills": [
      {
        "price": "90000",
        "qty": "0.5",
        "makerUserId": "019318b7-6b22-7f32-843e-a4d32029c011",
        "makerOrderId": "01934c90-5011-739c-8512-ab18593a9218",
        "makerUserLeverage": "10",
        "makerMarginToRealase": "4500"
      }
    ]
  }
}
```

### Error Responses:
* `400 Bad Request`: `{ "message": "Invalid marketId" }`, `{ "message": "Invalid order side" }`, `{ "message": "Invalid price value" }`, `{ "message": "INSUFFICIENT_BALANCE" }`, or `{ "message": "FOK_ORDER_CANCELLED" }`
* `403 Forbidden`: `{ "message": "Incorrect token " }`
* `404 Not Found`: `{ "message": "MARKET_NOT_FOUND_BRO" }`

---

## 2. Cancel Order (`DELETE /api/v1/order/:orderId`)

Cancels an open or partially filled resting limit order from the orderbook and releases locked margin.

* **Method**: `DELETE`
* **URL**: `/api/v1/order/:orderId`
* **Authentication**: Required (`authmiddleware`)
* **Headers**: `token: <JWT>`, `Content-Type: application/json`

### Path Parameters:
* `orderId` (string, required): UUID of the order to cancel.

### Request Body:
```json
{
  "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
  "side": "BID"
}
```

### Internal Processing Flow:
1. Calls `loopback({ messageType: "CANCEL_ORDER", userId, orderId, marketId, side })`.
2. Engine locates order in `book.bids` or `book.asks`.
3. Unlocks the remaining locked margin back into the user's available balance.
4. Removes order from the `PriceLevel`, updates `level.totalQty`, and mirrors cancellation to Redis (`pub:user:<userId>`, `pub:depth:<marketId>`).
5. Emits `ORDER_CANCELLED` to `db-events`.

### Success Response (`200 OK`):
```json
{
  "succes": true,
  "message": "Order cancelled succesfully",
  "result": {
    "status": "SUCCESS",
    "orderId": "01934c90-5011-739c-8512-ab18593a9218"
  }
}
```

---

## 3. Exit Position (`POST /api/v1/exitPosition`)

Aggressively squares off an active market position.

* **Method**: `POST`
* **URL**: `/api/v1/exitPosition`
* **Authentication**: Required (`authmiddleware`)
* **Headers**: `token: <JWT>`, `Content-Type: application/json`

### Request Body:
```json
{
  "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
  "qty": "0.5"
}
```

### Internal Processing Flow:
1. Checks if user holds a position in `marketId`.
2. Translates request into an aggressive opposing market order with `reduceOnly: true`.
3. Closes position up to specified `qty`, settles realized PnL, and unlocks position margin.

### Success Response (`200 OK`):
```json
{
  "orderId": "01934cbf-7012-70b1-a4f2-984e4125b271",
  "message": "Exit position requested",
  "result": {
    "status": "SUCCESS"
  }
}
```
