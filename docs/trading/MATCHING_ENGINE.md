# Matching Algorithm Specification

File: [apps/engine/src/matching-engine/matching.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/engine/src/matching-engine/matching.ts)

The matching engine algorithm (`executeMatchingFunction`) is a deterministic, price-time priority matching loop supporting Limit and Market orders, partial fills across multiple maker orders, and Fill Or Kill (FOK) constraints.

---

## 1. Algorithm Overview

```
FUNCTION executeMatchingFunction(command, loopbackId, streamEntryId):
    1. Extract order parameters (userId, marketId, side, qty, price, leverage, orderType, timeInForce)
    2. Lookup OrderBook by marketId. If missing, return error.
    3. If timeInForce == "FOK":
         Calculate total available depth in opposing book within price boundary.
         If available depth < qty:
             Return rejection ("FOK_ORDER_CANCELLED").
    4. Sort opposing book prices:
         If BID (buying): sort Asks ascending (lowest ask first).
         If ASK (selling): sort Bids descending (highest bid first).
    5. Initialize fills = [], remainingQty = qty
    6. FOR EACH priceLevel IN opposingBook:
         IF orderType == "LIMIT":
             IF BID AND priceLevel.price > limitPrice: BREAK
             IF ASK AND priceLevel.price < limitPrice: BREAK
         
         FOR EACH makerOrder IN priceLevel.orders:
             IF makerOrder.userId == incomingUserId:
                 SKIP (Self-trade prevention)
             
             matchQty = MIN(makerOrder.remainingQty, remainingQty)
             record fill at priceLevel.price for matchQty
             
             makerOrder.filledQty += matchQty
             remainingQty -= matchQty
             
             IF makerOrder is completely filled:
                 remove makerOrder from priceLevel.orders
                 delete from Redis user:makerId:open_orders
             ELSE:
                 update Redis user:makerId:open_orders with new filledQty
             
             IF remainingQty == 0: BREAK
         
         IF priceLevel.orders is empty:
             delete priceLevel from opposingBook
         
         IF remainingQty == 0: BREAK
    7. Process post-match positions and PnL for taker and all makers.
    8. Handle remaining taker quantity:
         IF remainingQty == 0: status = "FILLED"
         ELSE IF remainingQty < qty:
             IF orderType == "LIMIT":
                 status = "PARTIALLY_FILLED"
                 insert resting taker order into book for remainingQty
             ELSE:
                 status = "PARTIALLY_FILLED" (unfilled portion cancelled)
         ELSE:
             IF orderType == "LIMIT":
                 status = "OPEN"
                 insert resting taker order into book for full qty
             ELSE:
                 status = "CANCELLED"
    9. Emit TRADE_EXECUTED and ORDER_ACCEPTED to 'db-events'.
   10. Mirror updated depth to Redis Hashes and Pub/Sub.
   11. Reply to backend via 'to-backend'.
```

---

## 2. Match Execution Price Rule

* **Execution Price**: Fills execute at the **maker's resting limit price**, not the taker's submitted price.
* If a trader submits a Bid at \$90,500 and matches an Ask resting at \$90,000, execution occurs at **\$90,000**.
* `book.lastTradedPrice` is updated to the execution price of the most recent fill.

---

## 3. Self-Trade Prevention

The matching engine enforces self-trade prevention:
```typescript
if (maker.userId === userId) {
  // Prevent matching own resting order; skip to next order in queue
  continue;
}
```
If a trader places an order against their own resting order, the engine skips their resting maker order, maintaining book queue integrity without self-filling.
