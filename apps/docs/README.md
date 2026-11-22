# Documentation Portal Application (`apps/docs`)

This is a [Next.js](https://nextjs.org) application workspace bootstrapped with `create-next-app` inside the Turborepo monorepo.

For the canonical technical, architectural, API, and trading documentation of the Perps Trading Platform, please refer to the root [docs/](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/README.md) directory.

---

## Role in the Monorepo

* **Framework**: Next.js (App Router), React 19, CSS Modules.
* **Intended Purpose**: Scaffolded to serve as a future public or customer-facing documentation website for the exchange.
* **Current Status**: Scaffolded application boilerplate. It is not currently connected to or rendering the root Markdown documentation files in `Perps/docs/`.

---

## Running the Application Locally

```bash
# Install dependencies
bun install

# Run Next.js dev server on port 3002 (avoids conflict with backend on 3000)
bun dev --port 3002

# Build production bundle
bun run build

# Type check
bun run check-types
```
