# Development Workflow

This document outlines daily developer workflows, package management commands, formatting, linting, and typecheck protocols for the Perps monorepo.

---

## 1. Monorepo Commands

All commands can be executed from the root `Perps/` directory:

| Task | Command | Description |
| :--- | :--- | :--- |
| **Install Dependencies** | `bun install` | Installs dependencies across all workspaces with lockfile resolution. |
| **Type Check All** | `bun run check-types` | Runs `turbo run check-types`, executing `tsc --noEmit` across all 12 packages. |
| **Lint All** | `bun run lint` | Runs `turbo run lint` across workspaces. |
| **Code Formatting** | `bun run format` | Runs Prettier across all `.ts`, `.tsx`, and `.md` files. |
| **Build All** | `bun run build` | Compiles production outputs using Turborepo dependency caching. |
| **Development** | `bun run dev` | Concurrently starts persistent dev processes. |

---

## 2. Working with Individual Workspaces

You can use Turborepo's `--filter` flag to target specific packages without compiling unrelated services:

```bash
# Typecheck only the matching engine
bun exec turbo check-types --filter=engine

# Build only the frontend
bun exec turbo build --filter=web

# Run tests in apps/tests
bun exec turbo test --filter=tests
```

---

## 3. Database Schema Evolution

When modifying `packages/db/prisma/schema.prisma`:
1. Edit model definitions in `packages/db/prisma/schema.prisma`.
2. Generate migration and apply to local DB:
   ```bash
   cd packages/db
   bunx prisma migrate dev --name describe_your_change
   ```
3. Re-generate Prisma Client:
   ```bash
   bunx prisma generate
   ```
4. Verify monorepo type safety:
   ```bash
   cd ../..
   bun run check-types
   ```
