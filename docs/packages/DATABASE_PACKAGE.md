# Database Package (`packages/db`)

Files:
* [packages/db/index.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/db/index.ts)
* [packages/db/prisma/schema.prisma](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/db/prisma/schema.prisma)

The `packages/db` package encapsulates all database access logic, Prisma schema configurations, migration scripts, and client generation.

---

## 1. Package Configuration

### Dependencies:
* `@prisma/client`: Auto-generated type-safe query builder.
* `@prisma/adapter-pg`: High-performance PostgreSQL driver adapter for Prisma 7.
* `pg`: Pure JavaScript/native PostgreSQL driver.

### Scripts:
* `bun run prisma:generate`: Re-compiles Prisma Client into `generated/prisma/`.
* `bun run prisma:migrate`: Applies migrations against the active PostgreSQL database.
* `bun run prisma:studio`: Launches Prisma Studio visual database browser.

---

## 2. Singleton Initialization Pattern

To prevent exhausting database connection pools during local development and hot module reloading:

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

---

## 3. Migration History

Located in [packages/db/prisma/migrations/](file:///c:/Users/777su/Desktop/Perps_Project/Perps/packages/db/prisma/migrations/):
* `20261021162049_init`: Initial schema migration establishing `User`, `Market`, `Wallet`, `Position`, `Order`, and `Fill` tables, composite unique keys, and foreign key relations.
