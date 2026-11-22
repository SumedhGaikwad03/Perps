# Market APIs

File: [apps/backend/coreRoutes/market.routes.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/coreRoutes/market.routes.ts)

The Market module serves orderbook depth snapshots, 24-hour trading statistics, and provides an administrative provisioning endpoint for new perpetual derivative markets.

---

## 1. Fetch Orderbook Depth (`GET /api/v1/market/depth`)

Returns the current L2 orderbook ladder directly from Redis memory mirrors without routing traffic through the matching engine.

* **Method**: `GET`
* **URL**: `/api/v1/market/depth`
* **Authentication**: None (Public)

### Query Parameters:
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `marketId` or `id` | string | Optional | UUID of the target market |
| `symbol` | string | Optional | Ticker symbol (e.g. `BTC_USDC`). If provided, marketId is resolved from DB. |

*Note: At least one of `marketId` or `symbol` must be provided.*

### Internal Processing Flow:
1. Resolves `targetMarketId`.
2. Queries Redis Hash `redisClient.hGet("market:" + targetMarketId + ":depth", "data")`.
3. If no resting depth exists, returns an empty bids/asks structure with status 200.
4. Returns the parsed snapshot.

### Success Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
    "symbol": "BTC_USDC",
    "lastTradedPrice": "91250.5",
    "bids": [
      ["91250.0", "1.450"],
      ["91240.0", "0.850"],
      ["91200.0", "5.200"]
    ],
    "asks": [
      ["91260.0", "0.500"],
      ["91275.0", "2.100"],
      ["91300.0", "10.000"]
    ],
    "timestamp": 1732316400123
  }
}
```

---

## 2. Fetch All Markets with 24h Stats (`GET /api/v1/markets`)

Pulls all registered markets from PostgreSQL, retrieves the latest traded price from Redis, and aggregates 24-hour volume, high, and low metrics from `prisma.fill`.

* **Method**: `GET`
* **URL**: `/api/v1/markets`
* **Authentication**: None (Public)

### Success Response (`200 OK`):
```json
{
  "success": true,
  "data": [
    {
      "id": "019318a0-2f94-7128-b0cf-53e30f146a05",
      "symbol": "BTC_USDC",
      "slug": "btc-usdc",
      "baseToken": "BTC",
      "tickSize": "0.1",
      "stepSize": "0.001",
      "imgUrl": "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
      "lastTradedPrice": "91250.5",
      "high24h": "92100.0",
      "low24h": "89500.0",
      "volume24h": "1452390.50"
    }
  ]
}
```

---

## 3. Live System & Markets Overview (`GET /api/v1/live` and `GET /live`)

Returns real-time system status, total registered markets, and live mark and perp prices for the frontend terminal and external health checks.

* **Method**: `GET`
* **URL**: `/api/v1/live` (also available via root alias `/live`)
* **Authentication**: None (Public)

### Success Response (`200 OK`):
```json
{
  "status": "ONLINE",
  "activeMarketsCount": 2,
  "timestamp": 1732316400123,
  "markets": [
    {
      "id": "019318a0-2f94-7128-b0cf-53e30f146a05",
      "symbol": "BTC_USDC",
      "baseToken": "BTC",
      "lastTradedPrice": "90500.00",
      "markPrice": "90510.50"
    }
  ]
}
```

---

## 4. Admin Create Market (`POST /api/v1/admin/market`)

Administrative endpoint to create a new perpetual market in PostgreSQL and dynamically register it in the in-memory matching engine.

* **Method**: `POST`
* **URL**: `/api/v1/admin/market`
* **Authentication**: Required (`adminMiddleWare`)
* **Headers**:
  - `admin_secret: <SECRET>` (or `x-admin-token: <SECRET>` or `token: <SECRET>`)
  - `Content-Type: application/json`

### Request Body:
| Field | Type | Required | Default | Description | Constraints |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `symbol` | string | Yes | — | Market symbol | Unique (e.g. `SOL_USDC`) |
| `slug` | string | Yes | — | URL slug | Unique (e.g. `sol-usdc`) |
| `baseToken` | string | Yes | — | Underlying token | Must be `"BTC"`, `"SOL"`, or `"ETH"` |
| `imgUrl` | string | Yes | — | Icon URL | Valid URL string |
| `tickSize` | string | No | `"0.1"` | Minimum price increment | Numeric > 0 |
| `stepSize` | string | No | `"0.001"` | Minimum quantity increment | Numeric > 0 |

```json
{
  "symbol": "SOL_USDC",
  "slug": "sol-usdc",
  "baseToken": "SOL",
  "imgUrl": "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  "tickSize": "0.01",
  "stepSize": "0.01"
}
```

### Internal Processing Flow:
1. `adminMiddleWare` verifies administrative credentials.
2. Validates that `baseToken` is one of `["BTC", "SOL", "ETH"]`.
3. Verifies uniqueness of `symbol` and `slug` in PostgreSQL.
4. Inserts new `Market` row into PostgreSQL via `prisma.market.create`.
5. Dispatches `CREATE_MARKET` to the matching engine via `loopback()`.
6. Matching engine instantiates a new in-memory `OrderBook`, maps `baseToken` to `marketId`, and mirrors depth to Redis.

### Success Response (`200 OK`):
```json
{
  "id": "019318b2-5a10-7210-9118-ff31a240bc99",
  "message": " well the market request has arrived as  ",
  "engineStatus": {
    "status": "SUCCESS",
    "marketId": "019318b2-5a10-7210-9118-ff31a240bc99"
  }
}
```

### Error Responses:
* `400 Bad Request`: `{ "message": "The body is for request is not complete bro  " }` or `{ "message": "Unsupported base token bro" }`
* `403 Forbidden`: `{ "message": "Token is invaild bro " }`
* `409 Conflict`: `{ "message": "The Market already exists bro " }`
