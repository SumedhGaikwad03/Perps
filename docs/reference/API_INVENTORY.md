# Complete API Inventory

This document provides a tabular inventory of all 15 registered endpoints in `apps/backend`.

---

## 1. Inventory Table

| ID | Module | Method | Registered Path | Alias Path (Dual Mount) | Auth Guard | Controller File | Implementation Status |
| :-: | :--- | :---: | :--- | :--- | :---: | :--- | :---: |
| **AUTH-01** | Auth | `POST` | `/api/v1/signup` | — | None | `coreRoutes/auth.routes.ts` | Complete |
| **AUTH-02** | Auth | `POST` | `/api/v1/signin` | — | None | `coreRoutes/auth.routes.ts` | Complete |
| **ORD-01** | Order | `POST` | `/api/v1/order` | — | `authmiddleware` | `coreRoutes/order.routes.ts` | Complete |
| **ORD-02** | Order | `DELETE`| `/api/v1/order/:orderId` | — | `authmiddleware` | `coreRoutes/order.routes.ts` | Complete |
| **ORD-03** | Order | `POST` | `/api/v1/exitPosition` | — | `authmiddleware` | `coreRoutes/order.routes.ts` | Complete |
| **MKT-01** | Market | `GET` | `/api/v1/market/depth` | — | None | `coreRoutes/market.routes.ts` | Complete |
| **MKT-02** | Market | `GET` | `/api/v1/markets` | — | None | `coreRoutes/market.routes.ts` | Complete |
| **MKT-03** | Market | `POST` | `/api/v1/admin/market` | — | `adminMiddleWare` | `coreRoutes/market.routes.ts` | Complete |
| **COL-01** | Collateral | `POST` | `/api/v1/onRamp` | — | `authmiddleware` | `coreRoutes/collateral.routes.ts` | Complete |
| **COL-02** | Collateral | `POST` | `/api/v1/offRamp` | — | `authmiddleware` | `coreRoutes/collateral.routes.ts` | Complete |
| **USR-01** | User | `GET` | `/api/v1/user/live` | `/api/v1/live` | `authmiddleware` | `userRoutes/userRoutes.account.ts` | Complete |
| **USR-02** | User | `GET` | `/api/v1/user/wallet` | `/api/v1/wallet` | `authmiddleware` | `userRoutes/userRoutes.account.ts` | Complete |
| **USR-03** | User | `GET` | `/api/v1/user/Positions` | `/api/v1/Positions` | `authmiddleware` | `userRoutes/userRoutes.account.ts` | Complete |
| **USR-04** | User | `GET` | `/api/v1/user/openOrders` | `/api/v1/openOrders` | `authmiddleware` | `userRoutes/userRoutes.account.ts` | Complete |
| **USR-05** | User | `GET` | `/api/v1/user/orderHistory`| `/api/v1/orderHistory` | `authmiddleware` | `userRoutes/userRoutes.account.ts` | Complete |
| **USR-06** | User | `GET` | `/api/v1/user/Account` | `/api/v1/Account` | `authmiddleware` | `userRoutes/userRoutes.account.ts` | Incomplete (Empty stub) |

---

## 2. Quantitative Summary

* **Total Registered Route Handlers**: 16 (15 unique functional endpoints, 1 incomplete stub).
* **Endpoints by Method**:
  - `POST`: 7
  - `GET`: 8
  - `DELETE`: 1
* **Endpoints Requiring User Authentication (`authmiddleware`)**: 10
* **Endpoints Requiring Administrator Authorization (`adminMiddleWare`)**: 1
* **Public Endpoints**: 4 (`/signup`, `/signin`, `/market/depth`, `/markets`)
