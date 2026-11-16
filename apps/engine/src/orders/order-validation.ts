import type { toEngine } from "common";
import type { OrderBook, Position } from "../types";

export type OrderValidationResult =
  | { isValid: true }
  | { isValid: false; error: string; data?: string };

// checks if the user has given a vaild price and quantity
export function validateOrderParams(
  command: Extract<toEngine, { messageType: "CREATE_ORDER" }>,
  book: OrderBook,
  numQty: number,
  numPrice: number,
  userLeverage: number,
): OrderValidationResult {
  const { price, orderType, side } = command;

  // checks if the user has given a vaild price and quantity
  if (
    !Number.isFinite(numQty) ||
    numQty <= 0 ||
    (orderType === "LIMIT" && (!price || numPrice <= 0))
  ) {
    return {
      isValid: false,
      error: "INVAILD_PRICE_OR_QTY",
      data: "",
    };
  }

  if (
    (orderType !== "LIMIT" && orderType !== "MARKET") ||
    (side !== "BID" && side !== "ASK")
  ) {
    return {
      isValid: false,
      error: "ORDER_TYPE_OR_SIDE_INAVILD_BROO",
      data: " ",
    };
  }

  if (userLeverage <= 0 || !Number.isFinite(userLeverage)) {
    return {
      isValid: false,
      error: "INVAILD_LEVERAGE_BRO",
      data: " ",
    };
  }

  if (book.stepSize) {
    const step = parseFloat(book.stepSize);
    if (numQty < step) {
      return {
        isValid: false,
        error: "QTY_BELOW_STEP_SIZE",
        data: "",
      };
    }
    const stepMultiple = numQty / step;
    if (Math.abs(stepMultiple - Math.round(stepMultiple)) > 1e-5) {
      return {
        isValid: false,
        error: "QTY_NOT_MULTIPLE_OF_STEP_SIZE",
        data: "",
      };
    }
  }

  if (orderType === "LIMIT" && price && book.tickSize) {
    const tick = parseFloat(book.tickSize);
    const tickMultiple = numPrice / tick;
    if (Math.abs(tickMultiple - Math.round(tickMultiple)) > 1e-5) {
      return {
        isValid: false,
        error: "PRICE_NOT_MULTIPLE_OF_TICK_SIZE",
        data: "",
      };
    }
  }

  return { isValid: true };
}

// check if the user needs extra margin to open an trade as is he squaring down on the current postion or opening a new posistion
// lets now check the posotion before calculating reduce onlu for the user as if the user actually has an open posotion to that would
//balance the squaring off the posotions
export function validateReduceOnlyOrder(
  command: Extract<toEngine, { messageType: "CREATE_ORDER" }>,
  position: Position | undefined,
  currentQty: number,
  numQty: number,
  side: "BID" | "ASK",
): OrderValidationResult {
  // this check if the user has passes the reduce only command that means that the user
  // has a position that he could leverage it against
  // the current opening positions
  if (command.reduceOnly) {
    // we check if the user currenlty holds an existing position here
    if (!position || currentQty <= 0) {
      return {
        isValid: false,
        error: "NO_OPEN_POSITION_TO_REDUCE",
        data: "",
      };
    }

    // IF THE USER HAS AN OPEN POSITION THEN WE CHECK if the postion is for the oppostie of what the user is asking for

    // we check what type of reducing only posotion does it have with itself here
    // only contraing trade could work for the reduce only to work fine
    const isReducingLong = position?.side === "LONG" && side === "ASK";

    // this checks that if the posotion is short and right now the order is trying to piggyback on itself
    const isReducingShort = position?.side === "SHORT" && side === "BID";

    // this means the current position is not complementing the command that was received
    if (!isReducingLong && !isReducingShort) {
      // this means that the user does not actually have an postion that they can leverage upon here
      return {
        isValid: false,
        error: "OPEN_POSITION_MUST_BE_OPPOSING_THE_CURRENT_POS",
        data: "",
      };
    }

    // now we check the qty that is required that here
    // the amount that the user can safely de-leverage here
    if (numQty > currentQty) {
      return {
        isValid: false,
        error: "THE_REQUIRED_POSITION_AMOUNT_IS_NOT_ENOUGH",
        data: "",
      };
    }
  }

  return { isValid: true };
}

// as the user only requires margin when the is expanind the current position
// or creating a new position not closing the old one
export function calculateRequiredMargin(
  reduceOnly: boolean | undefined,
  numQty: number,
  numPrice: number,
  userLeverage: number,
): number {
  return reduceOnly ? 0 : (numQty * numPrice) / userLeverage;
}
