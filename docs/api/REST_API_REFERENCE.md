# Complete REST API Reference

This document provides a comprehensive inventory of every HTTP endpoint registered in `apps/backend`.

---

## 1. Summary Inventory Table

The backend registers 14 unique route handlers. Because the user account router (`userRouter`) is mounted under both `/api/v1/user` and `/api/v1` in [apps/backend/index.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/index.ts#L26-L27), user endpoints can be reached via either path.

| # | Module | Method | Canonical Endpoint | Dual Mount Alias | Auth Required | Description | Status |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Auth | `POST` | `/api/v1/signup` | — | None | Register new user and wallet | Production |
| **2** | Auth | `POST` | `/api/v1/signin` | — | None | Authenticate user and issue JWT | Production |
| **3** | Order | `POST` | `/api/v1/order` | — | `authmiddleware` | Create and match Limit or Market order | Production |
| **4** | Order | `DELETE`| `/api/v1/order/:orderId` | — | `authmiddleware` | Cancel resting limit order | Production |
| **5** | Order | `POST` | `/api/v1/exitPosition` | — | `authmiddleware` | Close active position via market order | Production |
| **6** | Market | `GET` | `/api/v1/market/depth` | — | None | Fetch L2 orderbook depth snapshot | Production |
| **7** | Market | `GET` | `/api/v1/markets` | — | None | Fetch all active markets with 24h stats | Production |
| **8** | Market | `POST` | `/api/v1/admin/market` | — | `adminMiddleWare` | Create and initialize a new market | Production |
| **9** | Collateral | `POST` | `/api/v1/onRamp` | — | `authmiddleware` | Deposit collateral (USDC) into wallet | Production |
| **10** | Collateral | `POST` | `/api/v1/offRamp` | — | `authmiddleware` | Withdraw collateral from wallet | Production |
| **11** | User | `GET` | `/api/v1/user/live` | `/api/v1/live` | `authmiddleware` | Real-time mirror of balances, positions, orders | Production |
| **12** | User | `GET` | `/api/v1/user/wallet` | `/api/v1/wallet` | `authmiddleware` | Query durable wallet balance from DB | Production |
| **13** | User | `GET` | `/api/v1/user/Positions` | `/api/v1/Positions` | `authmiddleware` | Query user positions from DB | Production |
| **14** | User | `GET` | `/api/v1/user/openOrders` | `/api/v1/openOrders` | `authmiddleware` | Query open orders from Redis | Production |
| **15** | User | `GET` | `/api/v1/user/orderHistory` | `/api/v1/orderHistory` | `authmiddleware` | Query filled/cancelled orders from DB | Production |
| **16** | User | `GET` | `/api/v1/user/Account` | `/api/v1/Account` | `authmiddleware` | Account snapshot stub (hangs/unimplemented) | Incomplete |

### Total Unique Endpoints by HTTP Method:
* **`POST`**: 6 endpoints (`/signup`, `/signin`, `/order`, `/exitPosition`, `/admin/market`, `/onRamp`, `/offRamp`)
* **`GET`**: 8 endpoints (`/market/depth`, `/markets`, `/live`, `/wallet`, `/Positions`, `/openOrders`, `/orderHistory`, `/Account`)
* **`DELETE`**: 1 endpoint (`/order/:orderId`)
* **Total Unique Handlers**: 15 (14 fully implemented, 1 incomplete stub).

---

## 2. Inactive / Unmounted Route Modules

During codebase analysis, the file [apps/backend/marketRoutes/marketRoutes.analyse.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/marketRoutes/marketRoutes.analyse.ts) was discovered containing an empty `/markets` route stub. **This router is not imported or mounted in `index.ts`** and has been superseded by `coreRoutes/market.routes.ts`.
