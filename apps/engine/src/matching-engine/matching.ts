import type { toEngine } from "common";
import {
  getOrderBook,
  getOrCreateBalance,
  setBalance,
  getBalance,
  getPosition,
} from "../state";
import { publisher } from "../streams/publisher";
import { updatePositionFills } from "../positions";

export async function executeMatchingFunction(
  command: Extract<toEngine, { messageType: "CREATE_ORDER" }>,
  loopbackId: string,
  streamEntryId: string,
) {
  // THE EXTRACT KEY WORD is used to narrow down the union types in the in the commons
  // this matching function is used by two of the endpoints in the system that makes this an common way
  // for order to execute

  // now lets start to implemtn the logic in this function
  const { userId, marketId, side, qty, price, orderType, leverage, orderId } =
    command;

  // time to destruture the counts here

  const numQty = parseFloat(qty);

  const book = getOrderBook(marketId);

  const userLeverage = parseFloat(leverage);

  if (!book) {
    // we here are essentially returing a string that resolves to a promise 
    return "book not found broo";
  }

  const numPrice = price ? parseFloat(price) : book.lastTradedPrice;

  // the logic for matching order is as follows

  let remaningQty = numQty;

  // this is an fills array that will execute once in the lifecycle as how many orders can it eat in the orderbook
  // we define this array as for the the current fills that are happeining
  const fills: Array<{
    price: string;

    qty: string;
    //maker is the one who we swap with as he is the one that makes the fills possible
    makerOrderId: string;

    makerUserId: string;

    makerUserLeverage: string;

    makerMarginToRealase: string;
  }> = [];

  // we extract the type of order and then also find the matching sode that we would swap our order with
  const isBid = side === "BID";

  const opposingBook = isBid ? book.asks : book.bids;

  const sortedPrices = Array.from(opposingBook.keys()).sort((a, b) => {
    // if our bid is true we sort the prices in ascending as ask are sorted ascending and bids are sorts decending

    return isBid
      ? parseFloat(a) - parseFloat(b)
      : parseFloat(b) - parseFloat(a);
  });

  // we check the orderType as fok is possible or not here

  if (command.timeInForce === "FOK") {
    let available_qty = 0;

    for (const priceKey of sortedPrices) {
      // current level price
      const levelprice = Number(priceKey);

      if (orderType === "LIMIT") {
        if (isBid && levelprice > numPrice) break;
        if (!isBid && levelprice < numPrice) break;
      }
      // lets start with extracting the first level as

      const level = opposingBook.get(priceKey);

      if (!level) {
        continue;
      }

      available_qty += Number(level.totalQty);

      if (available_qty >= numQty) {
        break;
      }
    }

    // even at this point the availble qty is not enough to make the order
    // worth it to take this order now 
    if (available_qty < numQty) {
      // TO MAKE THE TAKER GET BACK HIS COLLATERAL AS

      const bal = getOrCreateBalance(userId);

      const marginToUnlock = command.reduceOnly
        ? 0
        : (numQty * numPrice) / userLeverage;

      const newAvail = (
        parseFloat(bal.available_bal) + marginToUnlock
      ).toString();
      const newLocked = (
        parseFloat(bal.locked_bal) - marginToUnlock
      ).toString();

      setBalance(userId, {
        available_bal: newAvail,
        locked_bal: newLocked,
      });

      // time for a wallet update

      await publisher.xAdd("db-events", "*", {
        eventType: "WALLET_UPDATE",
        payload: JSON.stringify({
          userId,
          amountAvail: newAvail,
          amountLocked: newLocked,
        }),
      });

      await publisher.xAdd("to-backend", "*", {
        loopbackId,
        status: "REJECTED",
        data: "",
        error: "THE_FOK_ORDER_IS_NOT_POSSIBLE_BRO_NOT_ENOUGH_QTY",
      });

      return;
    }
  }

  // now we have to check for ioc

  for (const priceKey of sortedPrices) {
    // THIS LOOP WILL KEEP ON FILLING ORDER UNITL THE REMANING QTY IS ZERO OR THREE ARE NO SUTABLE ORDERS TO SWAP AGAINST

    if (remaningQty <= 0) {
      break;
    }

    const levelPrice = parseFloat(priceKey); // WE HAVE THE CURRENT BEST PRICE
    // the prices were already sorted so this made sense

    if (orderType === "LIMIT") {
      // at limit orders the best price for each table is defined as as we cant find a better price then we break it off

      if (isBid && levelPrice > numPrice) break; // ask price is greater than num price that is given to the system by user
      if (!isBid && levelPrice < numPrice) break; // bid price is greater
    }

    // is all is set for limit or simply the order is for market then
    //pull the the entrie order list  for this price key
    const priceLevel = opposingBook.get(priceKey);

    // time to fill the order one at a time like this

    while (priceLevel?.orders.length! > 0 && remaningQty > 0) {
      // have to walk the order book to satifiy the orders we have injested

      // we extract the first order form the book

      const restingOrder = priceLevel?.orders[0];

      const restingOrderRemaning =
        parseFloat(restingOrder?.qty!) - parseFloat(restingOrder?.filledQty!);

      // The quantity that is matched with the order is here
      const matchQty = Math.min(remaningQty, restingOrderRemaning);

      const makerReamainingMargin = parseFloat(restingOrder!.lockedMargin);

      const makerMarginToRelease =
        restingOrderRemaning > 0
          ? Math.min(
              makerReamainingMargin,
              (matchQty / restingOrderRemaning) * makerReamainingMargin,
            )
          : 0;

      // we push the orders that are filed into quantity so right now the inmemory array has all the executed orders in the book
      fills.push({
        price: priceKey,
        qty: matchQty.toString(),
        makerOrderId: restingOrder?.originalOrderId!,
        makerUserId: restingOrder?.userId!,
        makerUserLeverage: restingOrder?.leverage! || "1",
        makerMarginToRealase: makerMarginToRelease.toString(),
      });

      // this is the updation in the resting order that we just filled
      restingOrder!.filledQty = (
        parseFloat(restingOrder!.filledQty) + matchQty
      ).toString();

      // reducing the margin for the margin is as follows as

      restingOrder!.lockedMargin = Math.max(
        0,
        makerReamainingMargin - makerMarginToRelease,
      ).toString();

      // this is the updation in the user remaing qty of the originalr order
      remaningQty -= matchQty;

      // now the reduce  the volume at the sitting order here
      priceLevel!.totalQty = (
        parseFloat(priceLevel?.totalQty!) - matchQty
      ).toString();

      // if the entire order is filled then we have to dequee that order

      if (
        parseFloat(restingOrder!.filledQty) >= parseFloat(restingOrder!.qty)
      ) {
        // this removes the order at index 0 and slides every other order by one position
        priceLevel?.orders.shift();
      }

      // if all the oders at the order book are eaten then we delete that price level
      // a price level is how much order sit at the price level is (price : (total Qty & orders[])) ;
      if (priceLevel?.orders.length == 0) {
        opposingBook.delete(priceKey);
      }
    }
  }
  // update the last traded price with the most recent fills (temp array for this cycle ) in the table

  if (fills.length > 0) {
    book.lastTradedPrice = parseFloat(fills[fills.length - 1]!.price);

    // this determines what the taker and maker orders are here

    const takerSide: "LONG" | "SHORT" = isBid ? "LONG" : "SHORT";

    const makerSide: "LONG" | "SHORT" = isBid ? "SHORT" : "LONG";

    // this is time to inalise an set for the affected users as this will hold the postions
    // that we have to snapshot in the db via the redis queue called the db-events

    const affectedUsers = new Set<string>();

    // now we have to update the postions for each of the trader as
    for (const fill of fills) {
      // as we have to proccess each fill and update the postion for each of the party (maker/taker)

      const fillQty = parseFloat(fill.qty);
      const fillPrice = parseFloat(fill.price);
      const makerLeverage = parseFloat(fill.makerUserLeverage);
      // now we have extracted the makerLeverage form the fills

      // tem to release the makerLocked balance
      const makerBal = getBalance(fill.makerUserId);

      const makerMarginToRealase = parseFloat(fill.makerMarginToRealase);

      if (makerBal && makerMarginToRealase > 0) {
        //const lockedBalance = parseFloat(makerBal.locked_bal);

        //const collateralToUnlock = (fillQty * fillPrice) / makerLeverage;
        // either the entire balce gets liquadated or the maker has zero locked bal it cant go naegative
        // so we fall back to zero
        const updatedLockedBalance = Math.max(
          0,
          parseFloat(makerBal.locked_bal) - makerMarginToRealase,
        );

        // we also have to set the makers balances now in the memory now that is done now
        setBalance(fill.makerUserId, {
          available_bal: makerBal.available_bal,
          locked_bal: updatedLockedBalance.toString(),
        });

        await publisher.xAdd("db-events", "*", {
          eventType: "WALLET_UPDATE",
          payload: JSON.stringify({
            userId: fill.makerUserId,
            amountAvail: makerBal.available_bal,
            amountLocked: updatedLockedBalance,
          }),
        });
      }

      //

      // this is for the taker id
      await updatePositionFills(
        userId,
        marketId,
        book.baseToken,
        takerSide,
        fill.qty,
        fill.price,
        userLeverage.toString(),
      );

      // this is for the maker id

      await updatePositionFills(
        fill.makerUserId,
        marketId,
        book.baseToken,
        makerSide,
        fill.qty,
        fill.price,
        makerLeverage.toString(),
      );

      // now to record the taker and the maker id for db updation of postion
      // as its a set all the dublicated values are already handled

      affectedUsers.add(userId);
      affectedUsers.add(fill.makerUserId);
    }

    // now the loop to update the postion as

    for (const affectedUserId of affectedUsers) {
      const posKey = `${affectedUserId}:${marketId}`;

      const currentPosition = getPosition(posKey);

      // if the postion exist then we can just push that current postion to the db if the postion does not exist then that means
      // the postionn was deleted by the in memory array so we just update the size of the postion to be zero
      const payload = currentPosition
        ? {
            userId: affectedUserId,
            marketId,
            size:
              currentPosition.side === "LONG"
                ? currentPosition?.qty
                : `-${currentPosition?.qty}`,
            entryPrice: currentPosition?.entryPrice,
            leverage: Number(currentPosition?.leverage),
            liquidationPrice: null,
          }
        : {
            userId: affectedUserId,
            marketId,
            size: "0",
            entryPrice: "0",
            leverage: 0,
            liquidationPrice: null,
          };

      await publisher.xAdd("db-events", "*", {
        eventType: "POSITION_UPDATED",
        payload: JSON.stringify(payload),
      });
    }
  }
  // this is now the post matching logic , the order that could be swapped is swaped alrady we can move ahead from here so this cycle is over

  let finalStatus: "FILLED" | "PARTIALLY_FILLED" | "OPEN" | "CANCELLED";

  finalStatus = "OPEN";

  const exuctedQty = numQty - remaningQty; // this is the amount that is still left to be executed

  if (remaningQty <= 0) {
    finalStatus = "FILLED";
    //return ;
  } else {
    //in case of a limit order we debralrt did not match the order as we dont have the required price but orders still exist
    if (orderType === "LIMIT" && command.timeInForce === "GTC") {
      finalStatus = exuctedQty > 0 ? "PARTIALLY_FILLED" : "OPEN";

      // all the unfinished limit order must sit on the same side of the order book for all
      const targetSide = isBid ? book.bids : book.asks;

      // this is the price that the order was places upon
      const restingPrice = price!;

      // get all the orders at the that level & we add volume to that level
      let level = targetSide.get(restingPrice);

      if (!level) {
        // if current price level does not exist then we create our own price
        // this is the
        level = {
          totalQty: "0",
          orders: [],
        };

        targetSide.set(restingPrice, level);
      }
      // if the that

      //pushing our order to the level that was needed
      const restingMarginLocked = command.reduceOnly
        ? "0"
        : ((remaningQty * numPrice) / userLeverage).toString();
      // currently the order sits on the orderbook so we have to push that order to the in memory array of open positions
      //
      level.orders.push({
        userId,
        originalOrderId: orderId,
        qty: numQty.toString(),
        filledQty: exuctedQty.toString(),
        leverage: userLeverage.toString(),
        lockedMargin: restingMarginLocked,
        reduceOnly: Boolean(command.reduceOnly),
      });

      //updating the depth of the order for that level
      level.totalQty = (parseFloat(level.totalQty) + remaningQty).toString();
    } else {
      // THIS IS WHEN THE  limit ioc is here
      finalStatus = exuctedQty > 0 ? "PARTIALLY_FILLED" : "CANCELLED";

      // calculate collateral locked for unfullfiled portain
      // there is no point in holding the unused margin in this

      const unusedMargin = command.reduceOnly
        ? 0
        : (remaningQty * numPrice) / userLeverage;

      if (unusedMargin > 0) {
        const latestBalance = getBalance(userId);

        setBalance(userId, {
          available_bal: (
            parseFloat(latestBalance!.available_bal) + unusedMargin
          ).toString(),
          locked_bal: (
            parseFloat(latestBalance!.locked_bal) - unusedMargin
          ).toString(),
        });
      }
    }
  }

  // now we unlock the collateral for the taker as well because the filled amount is now part of the postion
  // and if there was price improvment refund we send that back to available bal
  if (fills.length > 0 && !command.reduceOnly) {
    const totalActualSpend = fills.reduce(
      (sum, f) =>
        sum + (parseFloat(f.qty) * parseFloat(f.price)) / userLeverage,
      0,
    );

    // the num price is not nessaryly the corret methos its a rough estimation of the spends this num price is
    // the last traded price in the system
    const expectedSpent = (exuctedQty * numPrice) / userLeverage;

    const priceImprovementRefund = Math.max(
      0,
      expectedSpent - totalActualSpend,
    );

    const latestBalance = getOrCreateBalance(userId);

    // release the executed margin from locked bal since it now lives in postions
    // and add the price improvment refund back to avail balance
    const newLockedBal = Math.max(
      0,
      parseFloat(latestBalance.locked_bal) -
        totalActualSpend -
        priceImprovementRefund,
    ).toString();

    const newAvailBal = (
      parseFloat(latestBalance.available_bal) + priceImprovementRefund
    ).toString();

    setBalance(userId, {
      available_bal: newAvailBal,
      locked_bal: newLockedBal,
    });

    // sync the taker balance to postgress through db events
    await publisher.xAdd("db-events", "*", {
      eventType: "WALLET_UPDATE",
      payload: JSON.stringify({
        userId,
        amountAvail: newAvailBal,
        amountLocked: newLockedBal,
      }),
    });
  }
  // the full order is now completed its order

  const remainingOrderMargin =
    orderType === "LIMIT" && remaningQty > 0 && !command.reduceOnly
      ? (numQty * numPrice) / userLeverage
      : 0;

  const initialMargin = command.reduceOnly
    ? 0
    : (numQty * numPrice) / userLeverage;

  await publisher.xAdd("db-events", "*", {
    eventType: "ORDER_ACCEPTED",
    payload: JSON.stringify({
      orderId,
      marketId,
      userId,
      orderType,
      orderSide: side,
      price: orderType === "LIMIT" ? price! : null,
      qty,
      timeInForce: command.timeInForce,
      reduceOnly: Boolean(command.reduceOnly),
      initialMargin: initialMargin.toString(),
      lockedMargin: remainingOrderMargin.toString(),
    }),
  });

  await publisher.xAdd("db-events", "*", {
    eventType: "TRADE_EXECUTED",
    payload: JSON.stringify({
      takerUserId: userId,
      takerOrderId: orderId,
      marketId,
      fills,
    }),
  });

  await publisher.xAdd("to-backend", "*", {
    loopbackId,
    status: "SUCCESS",
    data: JSON.stringify({
      orderId,
      marketId,
      status: finalStatus,
      exuctedQty: exuctedQty.toString(),
      remaningQty: remaningQty.toString(),
      fills,
    }),
    error: " ", // keeping it at top level so its easy to exectue at the top level
  });
}
