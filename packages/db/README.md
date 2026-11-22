# Database Package (`packages/db`)

The `packages/db` package encapsulates PostgreSQL schema definitions, database migrations, and exposes the initialized Prisma 7 Client backed by `@prisma/adapter-pg`.

For complete relational schemas and model specifications, see [Database Architecture](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/infrastructure/DATABASE_ARCHITECTURE.md) and [Database Schema](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/infrastructure/DATABASE_SCHEMA.md).

---

## Key Features

* **Prisma ORM v7**: High-performance TypeScript database toolkit.
* **Driver Adapter**: Uses `@prisma/adapter-pg` to enable direct connection pooling.
* **Core Models**:
  - `User`: Account credentials and profile.
  - `Market`: Derivative perpetual contract configuration.
  - `Wallet`: Collateral balances (`amountAvail`, `amountLocked`).
  - `Position`: Active directional perpetual holdings (`size`, `entryPrice`, `leverage`).
  - `Order`: Submitted orders and statuses (`OPEN`, `PARTIALLY_FILLED`, `FILLED`, `CANCELLED`).
  - `Fill`: Historical trade execution ledger.

---

## Database Commands

```bash
# Apply pending migrations to PostgreSQL
bunx prisma migrate dev

# Generate Prisma Client
bunx prisma generate

# Open visual database browser
bunx prisma studio
```
