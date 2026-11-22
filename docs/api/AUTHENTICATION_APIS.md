# Authentication APIs

File: [apps/backend/coreRoutes/auth.routes.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/backend/coreRoutes/auth.routes.ts)

The Authentication module provides endpoints for registering users and acquiring session JSON Web Tokens.

---

## 1. User Sign Up (`POST /api/v1/signup`)

Registers a new unique user in PostgreSQL, securely hashes their password using Bun's native cryptographic hashing, and automatically provisions an empty margin wallet.

* **Method**: `POST`
* **URL**: `/api/v1/signup`
* **Authentication**: None (Public)
* **Headers**: `Content-Type: application/json`

### Request Body:
| Field | Type | Required | Description | Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `username` | string | Yes | Unique trader username | Non-empty string |
| `password` | string | Yes | Plaintext account password | Non-empty string |

```json
{
  "username": "trader_alice",
  "password": "SuperSecretPassword123!"
}
```

### Internal Processing Flow:
1. Validates that `username` and `password` are present and strings.
2. Checks PostgreSQL via `prisma.user.findUnique({ where: { username } })`. If exists, returns HTTP 409.
3. Hashes the password via `await Bun.password.hash(password)`.
4. Creates records in a single database operation:
   ```typescript
   await prisma.user.create({
     data: {
       username,
       password: hashPassword,
       wallet: { create: { amountAvail: "0", amountLocked: "0" } },
     },
   });
   ```
5. Returns HTTP 201 with the generated user UUID.

### Success Response (`201 Created`):
```json
{
  "id": "019318b7-6b22-7f32-843e-a4d32029c011",
  "message": "You have created an id here "
}
```

### Error Responses:
* `400 Bad Request`: `{ "error": "Username  and password are required" }`
* `409 Conflict`: `"This username already exist broo"`
* `500 Internal Server Error`: `{ "error": "Internal Server Error", "details": "..." }`

---

## 2. User Sign In (`POST /api/v1/signin`)

Validates trader credentials and issues an 8-hour signed JWT.

* **Method**: `POST`
* **URL**: `/api/v1/signin`
* **Authentication**: None (Public)
* **Headers**: `Content-Type: application/json`

### Request Body:
```json
{
  "username": "trader_alice",
  "password": "SuperSecretPassword123!"
}
```

### Internal Processing Flow:
1. Validates that `username` and `password` are present.
2. Queries user record via `prisma.user.findUnique({ where: { username } })`. If missing, returns HTTP 401.
3. Compares password against hashed digest using `await Bun.password.verify(password, User.password)`. If mismatched, returns HTTP 401.
4. Generates JWT signed with `process.env.JWT_SECRET`:
   ```typescript
   const token = jwt.sign({ userId: User.id }, secret, { expiresIn: "8h" });
   ```
5. Returns HTTP 200 with the `id` and signed `token`.

### Success Response (`200 OK`):
```json
{
  "id": "019318b7-6b22-7f32-843e-a4d32029c011",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMTkzMThiNy02YjIyLTdmMzItODQzZS1hNGQzMjAyOWMwMTEiLCJpYXQiOjE3MzIzMTYwMDAsImV4cCI6MTczMjM0NDgwMH0.XYZ..."
}
```

### Error Responses:
* `400 Bad Request`: `{ "error": "Username and password are required" }`
* `401 Unauthorized`: `{ "message": "This user does not exists broo " }` or `{ "message": "The password or username  is wrong brooo " }`
* `500 Internal Server Error`: `{ "error": "Internal Server Error", "details": "..." }`
