# WebSocket API Specification

File: [apps/ws/index.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/ws/index.ts)

The WebSocket Service provides low-latency, bidirectional streaming for real-time market data (L2 depth ladders, trades) and private trader execution reports (fills, balance updates, order states).

---

## 1. Connection Endpoint & Handshake

* **URL**: `ws://localhost:3001` (or `ws://localhost:3001?token=<JWT>`)
* **Handshake Authentication**: If a query parameter `?token=<JWT>` is appended during the HTTP upgrade handshake, the socket is immediately verified and bound to that `userId`.

### Initial Connection Message (Server $\to$ Client)
Upon successful connection, the server sends a connection confirmation:
```json
{
  "type": "connected",
  "id": "a92c30df-9011-4230-b1a1-cf518a99201a"
}
```

---

## 2. Client-to-Server Message Types (Inbound)

### A. In-Socket Authentication (`auth`)
Upgrades an unauthenticated or reconnected socket session to an authenticated state.
```json
{
  "action": "auth",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
* **Success Response**: `{ "type": "authenticated", "userId": "..." }`
* **Failure Response**: `{ "type": "error", "message": "token not vaild broo" }`

### B. Channel Subscription (`subscribe`)
Subscribes the socket to one or more real-time channels.
```json
{
  "action": "subscribe",
  "channels": ["depth:BTC_USDC", "trades:BTC_USDC"]
}
```
* **Server Confirmation**: `{ "type": "subscribed", "channels": ["depth:BTC_USDC", "trades:BTC_USDC"] }`
* **Special Behavior on `depth:*`**: The server immediately queries Redis Hash `market:<symbol>:depth` and pushes the latest cached snapshot to the client so that the orderbook renders instantly without waiting for the next trade or order tick.

### C. Channel Unsubscription (`unsubscribe`)
Removes the socket from specified channels.
```json
{
  "action": "unsubscribe",
  "channels": ["depth:BTC_USDC"]
}
```
* **Server Confirmation**: `{ "type": "unsubscribe", "channels": ["depth:BTC_USDC"] }`

### D. Heartbeat (`ping`)
Keeps client connections alive across NAT gateways and proxies.
```json
{
  "action": "ping"
}
```
* **Server Response**: `{ "type": "pong" }`

---

## 3. Server-to-Client Message Types (Outbound)

### A. Market Depth Update (`channel: depth:<symbol>`)
Emitted whenever an order is inserted, partially filled, completely filled, or cancelled.
```json
{
  "channel": "depth:BTC_USDC",
  "data": {
    "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
    "symbol": "BTC_USDC",
    "lastTradedPrice": "91250.5",
    "bids": [
      ["91250.0", "1.450"],
      ["91240.0", "0.850"]
    ],
    "asks": [
      ["91260.0", "0.500"],
      ["91275.0", "2.100"]
    ],
    "timestamp": 1732316400123
  }
}
```

### B. Public Trade Print (`channel: trades:<symbol>`)
Emitted on every matching execution.
```json
{
  "channel": "trades:BTC_USDC",
  "data": {
    "type": "TRADE",
    "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05",
    "fills": [
      {
        "price": "91250.0",
        "qty": "0.5",
        "timestamp": 1732316400125
      }
    ]
  }
}
```

### C. Private User Notification (`channel: <userId>`)
Streamed only to authenticated sockets associated with that user ID (forwarded from Redis `pub:user:<userId>`).

#### Wallet Balance Update:
```json
{
  "channel": "019318b7-6b22-7f32-843e-a4d32029c011",
  "data": {
    "type": "BALANCE_UPDATE",
    "available_bal": "9550.0",
    "locked_bal": "450.0"
  }
}
```

#### Order Cancellation Report:
```json
{
  "channel": "019318b7-6b22-7f32-843e-a4d32029c011",
  "data": {
    "type": "ORDER_CANCELLED",
    "orderId": "01934c90-5011-739c-8512-ab18593a9218",
    "marketId": "019318a0-2f94-7128-b0cf-53e30f146a05"
  }
}
```
