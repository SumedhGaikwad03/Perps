import type { toEngine } from "common";
import type { OpenOrder } from "../types";
import { STREAM_KEY, ENGINE_GROUP } from "../config";
import { getOrderBook, getOrCreateBalance, setBalance, mirrorOrderBookDepth } from "../state";
import { publisher } from "../streams/publisher";
import { DeleteMirrordOpenOrder } from "../state";


// this endpoint only work for the orders that are still resting on the book not being matched here 

export async function handleCancelOrder(
  command: Extract<toEngine, { messageType: "CANCEL_ORDER" }>,
  loopbackId: string,
  streamEntryId: string,
  clientRead: { xAck: (key: string, group: string, id: string) => Promise<any> },
): Promise<void> {
      // destructing the incoming request
      const { userId, marketId, orderId, side } = command;

      // we have to locate the order in the order book

      const book = getOrderBook(marketId);

      if (!book) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "MARKET_DOES_NOT_EXISTS_BRO",
        });
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      let foundOrder: OpenOrder | null = null;

      let orderPrice: string | null = null;

      let unfilledQty = "0";

      let sideP: "LONG" | "SHORT" = side == "BID" ? "LONG" : "SHORT";

      let baseToken = book.baseToken;

      if (side !== "BID" && side !== "ASK") {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: " ",
          error: "THE PROVIDED SIDE IS NOT VAILD VRO ",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      if (side === "BID") {
        // the level here basically signifies that lits a sting and array of orders for that price
        for (const [priceKey, level] of book.bids.entries()) {
          // the below map and checks each order if the the order id is matching with the origonal order id
          // or the user id in the current price level
          const idx = level.orders.findIndex(
            (o: OpenOrder) => o.originalOrderId === orderId && o.userId === userId,
          );

          // if we find the order in the array of orders that is idx is not -1
          // that means we have found the order on our own
          if (idx !== -1) {
            // We have retrived this order here
            foundOrder = level.orders[idx]!;

            orderPrice = priceKey;

            // this is the reamaing qty at the order that was found
            const unExexcutedQty =
              parseFloat(foundOrder!.qty) - parseFloat(foundOrder!.filledQty);

            // now we get the user balances for this type

            const UserBalance = getOrCreateBalance(userId);

            // this is the margi tied to this order by the user - we calauclate pro rated remaining margin
            const remainingMargin = foundOrder!.reduceOnly
              ? 0
              : (unExexcutedQty * parseFloat(priceKey)) /
                parseFloat(foundOrder!.leverage || "1");

            const marginToUnlock = Math.min(
              remainingMargin,
              parseFloat(UserBalance?.locked_bal || "0"),
            );

            const newAvailBal = (
              parseFloat(UserBalance.available_bal) + marginToUnlock
            ).toString();
            const newLockedBal = Math.max(
              0,
              parseFloat(UserBalance.locked_bal) - marginToUnlock,
            ).toString();

            setBalance(userId, {
              available_bal: newAvailBal,
              locked_bal: newLockedBal,
            });

            // update the postgress wallet balance via redis db events
            await publisher.xAdd("db-events", "*", {
              eventType: "WALLET_UPDATE",
              payload: JSON.stringify({
                userId,
                amountAvail: newAvailBal,
                amountLocked: newLockedBal,
              }),
            });

            // time to remove the order now

             DeleteMirrordOpenOrder(userId,orderId);
            foundOrder = level.orders.splice(idx, 1)[0]!;

            // update the quanty at the level
            level.totalQty = (
              parseFloat(level.totalQty) - unExexcutedQty
            ).toString();

            unfilledQty = unExexcutedQty.toString();

            if (level.orders.length == 0) {
              book.bids.delete(priceKey);
            }

            break;
          }
        }
      }
      // now we search asks if we have not found the order in bids
      else {
        // the level here basically signifies that lits a sting and array of orders for that price
        for (const [priceKey, level] of book.asks.entries()) {
          // the below map and checks each order if the the order id is matching with the origonal order id
          // or the user id in the current price level
          const idx = level.orders.findIndex(
            (o: OpenOrder) => o.originalOrderId === orderId && o.userId === userId,
          );

          // if we find the order in the array of orders that is idx is not -1
          // that means we have found the order on our own
          if (idx !== -1) {
            // We have retrived this order here
            foundOrder = level.orders[idx]!;

            orderPrice = priceKey;

            // this is the reamaing qty at the order that was found
            const unExexcutedQty =
              parseFloat(foundOrder!.qty) - parseFloat(foundOrder!.filledQty);

            // now we get the user balances for this type

            const UserBalance = getOrCreateBalance(userId);

            // this is the margi tied to this order by the user - we calauclate pro rated remaining margin
            const remainingMargin = foundOrder!.reduceOnly
              ? 0
              : (unExexcutedQty * parseFloat(priceKey)) /
                parseFloat(foundOrder!.leverage || "1");

            const marginToUnlock = Math.min(
              remainingMargin,
              parseFloat(UserBalance?.locked_bal || "0"),
            );

            const newAvailBal = (
              parseFloat(UserBalance.available_bal) + marginToUnlock
            ).toString();
            const newLockedBal = Math.max(
              0,
              parseFloat(UserBalance.locked_bal) - marginToUnlock,
            ).toString();

            setBalance(userId, {
              available_bal: newAvailBal,
              locked_bal: newLockedBal,
            });

            // update the postgress wallet balance via redis db events
            await publisher.xAdd("db-events", "*", {
              eventType: "WALLET_UPDATE",
              payload: JSON.stringify({
                userId,
                amountAvail: newAvailBal,
                amountLocked: newLockedBal,
              }),
            });

            // time to remove the order now

            DeleteMirrordOpenOrder(userId, orderId);
            foundOrder = level.orders.splice(idx, 1)[0]!;

            // update the quanty at the level
            level.totalQty = (
              parseFloat(level.totalQty) - unExexcutedQty
            ).toString();

            unfilledQty = unExexcutedQty.toString();

            if (level.orders.length == 0) {
              book.asks.delete(priceKey);
            }

            break;
          }
        }
      }

      if (!foundOrder || !orderPrice) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "THE_ORDER_WAS_NOT_FOUND_OR_FILLED",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }
      // notigy the db

      await publisher.xAdd("db-events", "*", {
        eventType: "ORDER_CANCELLED",
        payload: JSON.stringify({
          orderId,
          userId,
          marketId,
          status: "CANCELLED",
        }),
      });
      // all is now set what is left is to notify the backend what is hapning

      mirrorOrderBookDepth(marketId);

      await publisher.xAdd("to-backend", "*", {
        loopbackId,
        status: "SUCCESS",
        data: JSON.stringify({
          orderId,
          marketId,
          status: "CANCELLED",
          unfilledQty: unfilledQty,
        }),
        error: "",
      });

      await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
      return;
}
