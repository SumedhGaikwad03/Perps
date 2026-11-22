# Balance and Collateral APIs

Files:
* [apps/backend/coreRoutes/collateral.routes.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/coreRoutes/collateral.routes.ts)
* [apps/backend/userRoutes/userRoutes.account.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/userRoutes/userRoutes.account.ts#L77-L99)

This module handles margin deposits (on-ramp), withdrawals (off-ramp), and wallet queries.

---

## 1. Collateral Deposit / On-Ramp (`POST /api/v1/onRamp`)

Credits quote margin (USDC) into the user's trading account in the matching engine.

* **Method**: `POST`
* **URL**: `/api/v1/onRamp`
* **Authentication**: Required (`authmiddleware`)
* **Headers**: `token: <JWT>`, `Content-Type: application/json`

### Request Body:
| Field | Type | Required | Description | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `amount` | string / number | Yes | Collateral quantity to deposit | Finite, non-empty, > 0 |

```json
{
  "amount": "10000"
}
```

### Internal Processing Flow:
1. Validates `amount` (rejects null, booleans, objects, arrays, NaN, non-finite, or $\le 0$).
2. Calls `loopback({ messageType: "ON_RAMP", amount: amount.toString(), userId })`.
3. The engine increments `available_bal` in memory, mirrors updated balances to Redis Hash `user:${userId}:balances`, emits `WALLET_UPDATE` to `db-events`, and publishes to `pub:user:${userId}`.
4. Replies to backend loopback.

### Success Response (`200 OK`):
```json
{
  "message": "onramp is done ",
  "result": {
    "status": "SUCCESS",
    "available_bal": "10000",
    "locked_bal": "0"
  }
}
```

---

## 2. Collateral Withdrawal / Off-Ramp (`POST /api/v1/offRamp`)

Withdraws unencumbered margin from the trading engine.

* **Method**: `POST`
* **URL**: `/api/v1/offRamp`
* **Authentication**: Required (`authmiddleware`)
* **Headers**: `token: <JWT>`, `Content-Type: application/json`

### Request Body:
```json
{
  "amount": "2500"
}
```

### Internal Processing Flow:
1. Calls `loopback({ messageType: "OFF_RAMP", amount: amount.toString(), userId })`.
2. Engine checks if `available_bal >= amount`. If insufficient, rejects with error.
3. Decrements `available_bal`, mirrors to Redis Hashes, emits `WALLET_UPDATE` to `db-events`, and publishes to `pub:user:${userId}`.

### Success Response (`200 OK`):
```json
{
  "message": "the money is withdrawn broo",
  "result": {
    "status": "SUCCESS",
    "available_bal": "7500",
    "locked_bal": "0"
  }
}
```

---

## 3. Query Database Wallet (`GET /api/v1/wallet` or `GET /api/v1/user/wallet`)

Retrieves the persisted wallet record from PostgreSQL.

* **Method**: `GET`
* **URL**: `/api/v1/wallet` (or `/api/v1/user/wallet`)
* **Authentication**: Required (`authmiddleware`)
* **Headers**: `token: <JWT>`

### Success Response (`200 OK`):
```json
{
  "status": "SUCCESS",
  "data": {
    "id": "019318b7-6b22-7f32-843e-a4d32029c012",
    "userId": "019318b7-6b22-7f32-843e-a4d32029c011",
    "amountAvail": "7500",
    "amountLocked": "0",
    "createdAt": "2026-11-20T10:00:00.000Z",
    "updatedAt": "2026-11-22T06:30:00.000Z"
  }
}
```
