import type { toEngine } from "common";
import { STREAM_KEY, ENGINE_GROUP } from "../config";
import {
  getOrderBook,
  getOrCreateBalance,
  setBalance,
  getPositionByUserMarket,
} from "../state";
import { publisher } from "../streams/publisher";
import { executeMatchingFunction } from "../matching-engine";
import {
  validateOrderParams,
  validateReduceOnlyOrder,
  calculateRequiredMargin,
} from "./order-validation";

// Re-export dedicated services so callers can access all operations seamlessly
export { handleCreateMarket } from "./market.service";
export { handleOnRamp, handleOffRamp } from "./collateral.service";
export { handleExitPosition } from "./exit-position.service";
export * from "./order-validation";

export async function handleCreateOrder(
  command: Extract<toEngine, { messageType: "CREATE_ORDER" }>,
  loopbackId: string,
  streamEntryId: string,
  clientRead: { xAck: (key: string, group: string, id: string) => Promise<any> },
): Promise<void> {
  // this end point could be an sell order or an buy order anything can happen here
  // destructuring the requied payload here
  const {
    userId,
    orderId,
    marketId,
    qty,
    price,
    orderType,
    side,
    leverage,
  } = command;

  const book = getOrderBook(marketId);
  // we extact order book from the market

  if (!book) {
    await publisher.xAdd("to-backend", "*", {
      loopbackId,
      status: "REJECTED",
      data: "",
      error: "MARKET_NOT_FOUND_BRO",
    });

    // to avoid reprocessing or publishing this entry here

    await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
    return;
  }

  // we here extract the user balnce and all other things that are required to destructured
  const userBalance = getOrCreateBalance(userId);
  const numQty = parseFloat(qty);
  // here we infer what type of price does the user wants as its a limit price or market price
  // in market price we dont pass the price , that falls back to the last trader price 
  const numPrice = price ? parseFloat(price) : book.lastTradedPrice;

  const userLeverage = command.leverage ? parseFloat(leverage) : 1;

  // checks if the user has given a vaild price and quantity
  const paramValidation = validateOrderParams(
    command,
    book,
    numQty,
    numPrice,
    userLeverage,
  );

  if (!paramValidation.isValid) {
    await publisher.xAdd("to-backend", "*", {
      loopbackId,
      status: "REJECTED",
      data: paramValidation.data ?? "",
      error: paramValidation.error,
    });

    await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
    return;
  }

  // check if the user needs extra margin to open an trade as is he squaring down on the current postion or opening a new posistion

  // lets now check the posotion before calculating reduce onlu for the user as if the user actually has an open posotion to that would
  //balance the squaring off the posotions

  // this snippet will give off any position that the user has in the current market,
  // this is used to check for the case of the reduce only variable
  const position = getPositionByUserMarket(userId, marketId);

  const currentQty = position ? parseFloat(position.qty) : 0;

  // this check if the user has passes the reduce only command that means that the user
  // has a position that he could leverage it against
  // the current opening positions
  const reduceOnlyValidation = validateReduceOnlyOrder(
    command,
    position,
    currentQty,
    numQty,
    side,
  );

  if (!reduceOnlyValidation.isValid) {
    await publisher.xAdd("to-backend", "*", {
      loopbackId,
      status: "REJECTED",
      data: reduceOnlyValidation.data ?? "",
      error: reduceOnlyValidation.error,
    });

    await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
    return;
  }

  // as the user only requires margin when the is expanind the current position
  // or creating a new position not closing the old one
  const reqMargin = calculateRequiredMargin(
    command.reduceOnly,
    numQty,
    numPrice,
    userLeverage,
  );

  const currentAvailBalance = parseFloat(userBalance.available_bal);

  if (currentAvailBalance < reqMargin) {
    await publisher.xAdd("to-backend", "*", {
      loopbackId,
      status: "REJECTED",
      data: "",
      error: "INVAILD_AVAILABLE_BAL_BROO",
    });
    // this file ack the fact that the engine has admited that this request is acknowldge
    await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
    return;
  }

  // at the this point the order is determined vaild for that it should now exist in the book
  console.log("ORDER DEBUG:", {
    userId,
    orderId,
    marketId,
    qty: numQty,
    price: numPrice,
    orderType,
    side,
    leverage: userLeverage,
    availableBalance: currentAvailBalance,
    requiredMargin: reqMargin,
    reduceOnly: command.reduceOnly,
  });
  // we reduce the margin here form the available balances
  setBalance(userId, {
    available_bal: (currentAvailBalance - reqMargin).toString(),
    locked_bal: (parseFloat(userBalance.locked_bal) + reqMargin).toString(),
  });

  await executeMatchingFunction(command, loopbackId, streamEntryId);

  // the balances are lockend now

  // now the balacnece has been locked for the user , we now have to make the matching engine / work the matching engine

  await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
  return;
}
