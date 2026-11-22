# WebSocket Service (`apps/ws`)

The **WebSocket Service** is a real-time event distribution gateway running on Bun's native WebSocket engine. It bridges internal Redis Pub/Sub topics to connected browsers.

For complete protocol details, see [apps/ws Documentation](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/applications/WEBSOCKET_SERVICE.md) and [WebSocket API Specification](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/api/WEBSOCKET_API.md).

---

## Key Features

* **Sub-Millisecond Fanout**: Direct mapping from Redis Pub/Sub channels to Bun `ServerWebSocket` instances.
* **Dual Authentication**: Authenticate via URL query parameter (`?token=...`) or in-socket message (`{ action: "auth", token: "..." }`).
* **Instant Depth Replay**: Pushes cached depth snapshot immediately upon subscription to `depth:<symbol>`.
* **Private User Multiplexing**: Subscribes to `pub:user:*` pattern and routes personal events (fills, cancels, balance updates) only to verified sockets belonging to that user ID.
* **Heartbeat**: `{ action: "ping" }` $\to$ `{ type: "pong" }`.

---

## Running the Service

```bash
# Install dependencies
bun install

# Run WebSocket gateway (Port 3001)
bun run index.ts

# Type check
bun run check-types
```
