# Documentation Application (`apps/docs`)

The **Documentation Application** (`apps/docs`) is a Next.js application workspace bootstrapped with `create-next-app` within the Turborepo monorepo.

---

## 1. Role in the Monorepo

* **Package Name**: `docs` (private package).
* **Framework**: Next.js (App Router), React 19, CSS Modules.
* **Intended Purpose**: Designed to serve as a customer-facing or developer-facing web portal for hosting interactive API references, platform guides, and SDK documentation.
* **Current Status**: Scaffolded boilerplate. The canonical technical and architectural documentation of the platform is hosted as Markdown in the root `Perps/docs/` directory.

---

## 2. Directory Structure

```
apps/docs/
├── app/
│   ├── layout.tsx                     # Root HTML layout with Geist font definition
│   ├── page.tsx                       # Default Turborepo starter landing page
│   ├── globals.css                    # Base styling
│   └── page.module.css                # CSS module for landing page
├── next.config.js                     # Next.js bundler settings
├── package.json                       # Next.js and React dependencies
├── tsconfig.json                      # Next.js TypeScript compiler settings
└── README.md                          # Boilerplate Next.js instructions
```

---

## 3. Scripts

* **`bun dev`**: Starts local Next.js dev server on [http://localhost:3000](http://localhost:3000) (Note: Port conflicts with `apps/backend` if run simultaneously without specifying `--port 3002`).
* **`bun run build`**: Compiles production Next.js application into `.next/`.
* **`bun check-types`**: Runs `tsc --noEmit` to verify type safety.
