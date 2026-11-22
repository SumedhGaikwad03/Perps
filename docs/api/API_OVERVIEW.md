# API Overview and Conventions

This document provides conventions, base URLs, authentication schemes, and standard error envelopes for the Perps Trading Platform APIs.

---

## 1. Network Endpoints

| Protocol | Environment | Base URL | Primary Role |
| :--- | :--- | :--- | :--- |
| **HTTP (REST)** | Local Development | `http://localhost:3000/api/v1` | Authentication, order submission, cancellations, deposits, and account queries. |
| **WebSocket** | Local Development | `ws://localhost:3001` | High-frequency L2 orderbook depth, trade prints, and private account pushes. |

---

## 2. Authentication Headers

The API supports two authentication schemes depending on the route privilege:

### 1. User Authentication (`authmiddleware`)
Required for all trading, account, and wallet operations.
* **Header**: `token: <JWT>`
* **Format**: Standard JWT string issued by `POST /api/v1/signin`.
* *Note*: The middleware specifically reads `req.headers.token`. While `Authorization: Bearer <JWT>` is sent by some HTTP clients, the application logic directly binds to `req.headers.token`.

### 2. Administrator Authentication (`adminMiddleWare`)
Required for administrative market creation (`POST /api/v1/admin/market`).
* **Accepted Headers**:
  - `admin_secret: <SECRET>`
  - `x-admin-token: <SECRET>`
  - `token: <SECRET>`
* **Validation**: Matches against `process.env.ADMIN_SECRET`, or verifies a JWT signed with `ADMIN_SECRET`.

---

## 3. Standard Response Envelopes

### Success Envelopes
Standard single-resource response:
```json
{
  "status": "SUCCESS",
  "data": { ... }
}
```
Or action confirmation envelope:
```json
{
  "message": "Action completed successfully",
  "result": { ... }
}
```

### Error Envelopes
Standard validation or failure envelope:
```json
{
  "message": "Detailed error message describing the failure condition"
}
```
Internal server error envelope:
```json
{
  "error": "Internal Server Error",
  "details": "Error message stack or description"
}
```

---

## 4. HTTP Status Codes Used

* `200 OK`: Request succeeded; body contains response payload.
* `201 Created`: Resource successfully created (used in `/signup`).
* `400 Bad Request`: Validation failure (malformed payload, invalid quantity/price/leverage, missing fields).
* `401 Unauthorized`: Bad credentials or incorrect password.
* `403 Forbidden`: Missing, expired, or invalid authentication/admin token.
* `404 Not Found`: Resource does not exist (e.g., target market or order not found).
* `409 Conflict`: Unique constraint violation (username or market symbol already exists).
* `500 Internal Server Error`: Unhandled system exception or engine loopback timeout.
