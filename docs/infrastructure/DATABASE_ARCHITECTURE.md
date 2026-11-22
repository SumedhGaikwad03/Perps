# Database Architecture

Files:
* [packages/db/index.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/db/index.ts)
* [packages/db/prisma/schema.prisma](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/db/prisma/schema.prisma)

PostgreSQL is the durable source of truth for the Perps Trading Platform. It persists accounts, trading permissions, historical orders, trade fills, long-term positions, and market configurations.

---

## 1. Prisma 7 & Driver Adapter

The database package (`packages/db`) uses **Prisma ORM v7** configured with the native PostgreSQL driver adapter (`@prisma/adapter-pg`):

```typescript
// packages/db/index.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });
```

### Benefits of the Driver Adapter Architecture:
* Direct TCP socket pooling using native PostgreSQL drivers.
* High query throughput and low latency overhead compared to older Prisma binary engines.
* Standardized cross-workspace import: All applications import `{ prisma } from "db"`.

---

## 2. In-Memory Engine State vs PostgreSQL Cold Storage

The trading platform uses a dual-state architecture:

| Domain | In-Memory Engine State (`apps/engine`) | Cold Storage (`PostgreSQL via Prisma`) |
| :--- | :--- | :--- |
| **Orderbooks** | Live `bids` and `asks` Maps in RAM; low-latency matching. | Only resting (`OPEN`, `PARTIALLY_FILLED`) and completed (`FILLED`, `CANCELLED`) orders. |
| **Balances** | Instant balance checking and margin locking. | Persisted `Wallet` balance, updated asynchronously by `apps/db-events`. |
| **Positions** | Instant directional sizing and margin tracking. | Relational `Position` table with unique constraint `[userId, marketId]`. |
| **Fills & Trades** | Fills generated in RAM during matching. | Immutable, durable audit log in the `Fill` table. |

### Reconciliation on Boot:
When `apps/engine` launches, `bootstrapEngine()` synchronizes memory with PostgreSQL:
1. Queries all markets $\to$ instantiates in-memory orderbooks.
2. Queries all wallets $\to$ initializes user margin balances.
3. Queries all active positions $\to$ initializes position registry.
4. Queries all orders where `status IN ['OPEN', 'PARTIALLY_FILLED']` $\to$ re-inserts resting orders into the orderbook queues and mirrors depth to Redis Hashes.
