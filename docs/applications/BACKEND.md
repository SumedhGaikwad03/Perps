# Backend Service (`apps/backend`)

The **Backend Service** is an Express application running on Bun that serves as the RESTful gateway to the trading platform. It authenticates users, validates incoming orders, provides fast access to cached market data, and dispatches trading commands to the matching engine using Redis Streams.

---

## 1. Responsibilities & Structure

### Core Responsibilities:
1. **User Authentication & Session Management**: Manages password hashing using Bun's native cryptographic hashing (`Bun.password.hash`) and issues 8-hour signed JSON Web Tokens (JWT).
2. **Synchronous Loopback Gateway**: Bridges asynchronous matching engine commands over Redis streams using a request-response loopback pattern.
3. **Market Data & Depth Mirroring**: Serves L2 orderbook depth snapshots directly from Redis without touching the matching engine.
4. **Historical & Account Queries**: Queries PostgreSQL via Prisma for user wallets, historical closed orders, and positions.
5. **CORS Configuration**: Fully configured CORS middleware supporting cross-origin communication from frontend clients.

### Source File Structure:
```
apps/backend/
├── index.ts                           # Express server initialization, middleware, route mounting
├── loopback.ts                        # Redis stream publisher/consumer loopback pattern
├── request.d.ts                       # Express Request type extensions (userId)
├── middleWare/
│   └── authMiddleware.ts              # authmiddleware & adminMiddleWare guards
├── coreRoutes/
│   ├── auth.routes.ts                 # /signup and /signin controllers
│   ├── order.routes.ts                # /order, /order/:orderId, /exitPosition controllers
│   ├── market.routes.ts               # /market/depth, /markets, /admin/market controllers
│   └── collateral.routes.ts           # /onRamp and /offRamp controllers
├── userRoutes/
│   └── userRoutes.account.ts          # /live, /wallet, /Positions, /openOrders, /orderHistory
└── marketRoutes/
    └── marketRoutes.analyse.ts        # Unmounted draft /markets stub
```

---

## 2. Server Initialization & Middleware Stack

File: [apps/backend/index.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/index.ts)

```typescript
export const app = express();

// CORS configuration for web clients
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "token", "x-admin-token", "admin_secret"],
}));

app.use(express.json());

// Route registration
app.use("/api/v1", authRouter);
app.use("/api/v1", orderRouter);
app.use("/api/v1", marketRouter);
app.use("/api/v1", collateralRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1", userRouter); // Dual-mounted for backward compatibility

app.listen(3000, () => {
  console.log("server is running on port 3000 broo");
});
```

---

## 3. Authentication & Middleware

File: [apps/backend/middleWare/authMiddleware.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/middleWare/authMiddleware.ts)

### `authmiddleware`:
* Extracts token from `req.headers.token`.
* Verifies signature against `process.env.JWT_SECRET`.
* Injects `req.userId = decoded.userId`.
* Returns HTTP `403 { message: "Incorrect token " }` on signature or decoding failure.

### `adminMiddleWare`:
* Extracts admin secret from `req.headers.admin_secret`, `req.headers["x-admin-token"]`, or `req.headers.token`.
* Compares against `process.env.ADMIN_SECRET` directly, or verifies JWT signed with `ADMIN_SECRET`.
* Allows access to administrative operations (such as `POST /api/v1/admin/market`).
* Returns HTTP `403 { message: "Token is invaild bro " }` if unauthorized.

---

## 4. Redis Stream Integration (`loopback.ts`)

File: [apps/backend/loopback.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/loopback.ts)

The backend maintains two Redis connections:
1. `client`: Publishes commands to stream `engine`.
2. `subscriber`: Consumes execution replies from stream `to-backend` in consumer group `backend-consumer-group`.

When calling `loopback(message)`:
1. A unique `loopbackId = randomUUIDv7()` is generated.
2. A `DeferredPromise` is stored in `loopBackResolves.set(loopbackId, { resolve, reject, timer })`.
3. The message is pushed to stream `engine`.
4. A 10-second timer is armed. If the engine fails to reply within 10,000ms, the promise is rejected with a timeout error.
5. When the engine replies on `to-backend`, the promise resolves, clears the timer, acknowledges the stream entry with `xAck`, and returns the payload to the Express route handler.

---

## 5. Error Handling & Validation

* Incoming parameters (`qty`, `price`, `leverage`, `amount`) are strictly validated against NaN, non-finite values, and negative bounds before reaching Redis.
* Rejections from the engine (`status === "REJECTED"`) are converted into appropriate client HTTP statuses (HTTP 400 or HTTP 404).
