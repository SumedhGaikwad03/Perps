# WebSocket Service (`apps/ws`)

The **WebSocket Service** is a real-time event distribution gateway built using Bun's native high-performance WebSocket server (`Bun.serve`). It bridges internal Redis Pub/Sub events from the matching engine directly to client web browsers.

---

## 1. Responsibilities & Structure

### Core Responsibilities:
1. **Connection Lifecycle**: Handles WebSocket upgrades, assigns unique socket IDs, and manages disconnections and memory cleanups.
2. **Dual-Path Authentication**:
   - Handshake URL query authentication: `ws://localhost:3001?token=<JWT>`.
   - In-socket authentication: `{ action: "auth", token: "<JWT>" }`.
3. **Channel Multiplexing & Subscription Tracking**:
   - Maintains an inverted subscriber index: `channelSubscriber = new Map<string, Set<ServerWebSocket<SocketData>>>()`.
   - Dynamic Redis subscription: Only subscribes to a Redis Pub/Sub topic when at least one client requests that channel.
4. **Instant Depth Cache Replay**: Upon subscription to a `depth:*` channel, immediately fetches the latest L2 orderbook snapshot from Redis Hashes (`market:<target>:depth`) and pushes it to the client, preventing blank ladders on quiet markets.
5. **Private User Streaming**: Subscribes to Redis pattern `pub:user:*`, forwarding personal trade notifications, order updates, and balance adjustments to the user's active sockets.
6. **Heartbeat Protocol**: Responds to `{ action: "ping" }` frames with `{ type: "pong" }`.

### Source File Structure:
```
apps/ws/
├── index.ts                           # Server instantiation, Redis Pub/Sub bindings, event loop
├── package.json                       # Dependencies (bun-types, redis, jsonwebtoken)
├── tsconfig.json                      # Bun TypeScript configuration
└── README.md                          # Application notes
```

---

## 2. In-Memory Connection Model

File: [apps/ws/index.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/ws/index.ts)

```typescript
interface SocketData {
  id: string;                          // Cryptographic UUID for socket instance
  userId?: string;                     // Decoded userId if authenticated
  subscriptions: Set<string>;          // Channels subscribed to by this socket
}

// Maps public channel ("depth:BTC_USDC") -> Set of listening WebSockets
const channelSubscriber = new Map<string, Set<ServerWebSocket<SocketData>>>();

// Maps authenticated userId -> Set of user WebSockets (multi-tab support)
const userSocket = new Map<string, Set<ServerWebSocket<SocketData>>>();
```

---

## 3. Dynamic Channel Subscription Pattern

To conserve Redis connection and messaging overhead, the WebSocket server uses lazy topic registration:

```typescript
async function ensureRedisSubscription(channel: string) {
  if (channelSubscriber.has(channel)) return;

  channelSubscriber.set(channel, new Set());

  await subscriber.subscribe(`pub:${channel}`, (rawMessage) => {
    const clients = channelSubscriber.get(channel);
    if (!clients || clients.size === 0) return;

    const payload = JSON.stringify({
      channel,
      data: JSON.parse(rawMessage),
    });

    for (const ws of clients) {
      if (ws.readyState === 1) { // 1 = OPEN
        ws.send(payload);
      }
    }
  });
}
```

---

## 4. Disconnection Cleanup

When a WebSocket disconnects:
1. Iterates over `ws.data.subscriptions` and removes `ws` from `channelSubscriber.get(channel)`.
2. If authenticated, removes `ws` from `userSocket.get(userId)`.
3. If no sockets remain for that `userId`, purges the entry from `userSocket` to eliminate memory leaks.
