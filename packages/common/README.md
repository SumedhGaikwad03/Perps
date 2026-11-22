# Common Domain Package (`packages/common`)

The `packages/common` package is an internal TypeScript library housing the shared domain types, discriminated union payloads, and message contracts across the Perps monorepo.

For complete type reference, see [Common Package Documentation](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/packages/COMMON_PACKAGE.md).

---

## Key Exports

* **Domain Primitives**: `orderSide`, `OrderType`, `TimeInForce`, `SUPPORTED_BASE_TOKEN`, `BaseToken`.
* **Matching Engine Commands (`toEngine`)**: Discriminated union of messages sent from `apps/backend` to `apps/engine` (`CREATE_ORDER`, `CANCEL_ORDER`, `ON_RAMP`, `OFF_RAMP`, `EXIT_POSITION`, `CREATE_MARKET`).
* **Persistence Events (`DbEventMessage`)**: Discriminated union of events sent from `apps/engine` to `apps/db-events` (`TRADE_EXECUTED`, `ORDER_ACCEPTED`, `ORDER_CANCELLED`, `POSITION_UPDATED`, `WALLET_UPDATE`, `POSITION_LIQUIDATED`, `POSITION_BANKRUPT`, `MARKET_CREATED`).
* **State Mirror Types**: `MirrorOpenOrder`, `Tradefill`, `OrderResult`, `EngineResponsePayload`.

---

## Type Checking

```bash
bun run check-types
```
