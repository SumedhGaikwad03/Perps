import type { toEngine } from "common";
import type { OrderBook, PriceLevel } from "../types";
import { STREAM_KEY, ENGINE_GROUP } from "../config";
import {
  getOrderBook,
  hasOrderBook,
  setOrderBook,
  getOrCreateBalance,
  getBalance,
  setBalance,
  getPosition,
  getPositionByUserMarket,
  isBaseTokenSupported,
  addMarketToBaseToken,
  getMarkPrice,
} from "../state";
import { publisher } from "../streams/publisher";
import { executeMatchingFunction } from "../matching-engine";

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
      const numPrice = price ? parseFloat(price) : book.lastTradedPrice;

      // checks if the user has given a vaild price and quantity
      if (
        !Number.isFinite(numQty) ||
        numQty <= 0 ||
        (orderType === "LIMIT" && (!price || numPrice <= 0))
      ) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "INVAILD_PRICE_OR_QTY",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      if (
        (orderType !== "LIMIT" && orderType !== "MARKET") ||
        (side !== "BID" && side !== "ASK")
      ) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: " ",
          error: "ORDER_TYPE_OR_SIDE_INAVILD_BROO",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      const userLeverage = command.leverage ? parseFloat(leverage) : 1;

      if (userLeverage <= 0 || !Number.isFinite(userLeverage)) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: " ",
          error: "INVAILD_LEVERAGE_BRO",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      if (book.stepSize) {
        const step = parseFloat(book.stepSize);
        if (numQty < step) {
          await publisher.xAdd("to-backend", "*", {
            loopbackId,
            status: "REJECTED",
            data: "",
            error: "QTY_BELOW_STEP_SIZE",
          });
          await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
          return;
        }
        const stepMultiple = numQty / step;
        if (Math.abs(stepMultiple - Math.round(stepMultiple)) > 1e-5) {
          await publisher.xAdd("to-backend", "*", {
            loopbackId,
            status: "REJECTED",
            data: "",
            error: "QTY_NOT_MULTIPLE_OF_STEP_SIZE",
          });
          await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
          return;
        }
      }

      if (orderType === "LIMIT" && price && book.tickSize) {
        const tick = parseFloat(book.tickSize);
        const tickMultiple = numPrice / tick;
        if (Math.abs(tickMultiple - Math.round(tickMultiple)) > 1e-5) {
          await publisher.xAdd("to-backend", "*", {
            loopbackId,
            status: "REJECTED",
            data: "",
            error: "PRICE_NOT_MULTIPLE_OF_TICK_SIZE",
          });
          await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
          return;
        }
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
      if (command.reduceOnly) {
        // we check if the user currenlty holds an existing position here
        if (!position || currentQty <= 0) {
          await publisher.xAdd("to-backend", "*", {
            loopbackId,
            status: "REJECTED",
            data: "",
            error: "NO_OPEN_POSITION_TO_REDUCE",
          });

          await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);

          return;
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

          await publisher.xAdd("to-backend", "*", {
            loopbackId,
            status: "REJECTED",
            data: "",
            error: "OPEN_POSITION_MUST_BE_OPPOSING_THE_CURRENT_POS",
          });
          await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
          return;
        }

        // now we check the qty that is required that here
        // the amount that the user can safely de-leverage here

        if (numQty > currentQty) {
          await publisher.xAdd("to-backend", "*", {
            loopbackId,
            status: "REJECTED",
            data: "",
            error: "THE_REQUIRED_POSITION_AMOUNT_IS_NOT_ENOUGH",
          });
          await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
          return;
        }
      }

      // as the user only requires margin when the is expanind the current position
      // or creating a new position not closing the old one
      const reqMargin = command.reduceOnly
        ? 0
        : (numQty * numPrice) / userLeverage;

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

export async function handleCreateMarket(
  command: Extract<toEngine, { messageType: "CREATE_MARKET" }>,
  loopbackId: string,
  streamEntryId: string,
  clientRead: { xAck: (key: string, group: string, id: string) => Promise<any> },
): Promise<void> {
      // to calauate the markprice the mark prices should only be created on top of existince market places
      // then the mark price calaultion becomes easy and secure
      // we are extracting the market here
      const { symbol, tickSize, stepSize, marketId, baseToken, slug } = command;

      // we have to check if the duplicate market even exist

      if (hasOrderBook(marketId)) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "MARKET_ALREADY_EXISTS",
        });

        // we ack the req as this req has been processed
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);

        return;
      }

      const rawBaseToken = baseToken?.toUpperCase();

      if (!rawBaseToken || !isBaseTokenSupported(rawBaseToken)) {
        console.log("this base token does not exist in the project broo");

        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "BASE_TOKEN_DOES_NOT_SUPPORTED",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      const numTickSize = Number(tickSize);
      const numStepSize = Number(stepSize);

      if (
        !Number.isFinite(numStepSize) ||
        !Number.isFinite(numTickSize) ||
        numTickSize <= 0 ||
        numStepSize <= 0
      ) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "THE_TICK_SIZE_IS_INVAILD_BRO",
        });
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      // time to piggyback the existing tokens to the already defines base tokens in the program
      addMarketToBaseToken(rawBaseToken, marketId);

      const currentMarkPrice = getMarkPrice(rawBaseToken);

      // now we have vaildated  that the engine exists then we move ahead and create an orderbook

      const newBook: OrderBook = {
        marketId,
        symbol,
        lastTradedPrice: currentMarkPrice ? parseFloat(currentMarkPrice) : 0,
        tickSize,
        stepSize,
        baseToken: rawBaseToken,
        bids: new Map<string, PriceLevel>(),
        asks: new Map<string, PriceLevel>(),
      };

      setOrderBook(marketId, newBook);

      console.log("orderBook has been created for the market ");
      // the orderbook has been created for the

      await publisher.xAdd("to-backend", "*", {
        loopbackId,
        status: "SUCCESS",
        data: JSON.stringify({
          marketId,
          baseToken,
          symbol,
          tickSize,
          stepSize,
          status: "INTIATILISED",
        }),
        error: "",
      });

      await publisher.xAdd("db-events", "*", {
        eventType: "MARKET_CREATED",
        payload: JSON.stringify({
          marketId,
          symbol,
          slug,
          baseToken: baseToken,
          tickSize: tickSize,
          stepSize: stepSize,
        }),
      });

      await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
      return;
}

export async function handleOnRamp(
  command: Extract<toEngine, { messageType: "ON_RAMP" }>,
  loopbackId: string,
  streamEntryId: string,
  clientRead: { xAck: (key: string, group: string, id: string) => Promise<any> },
): Promise<void> {
      // extarct the info from the command

      const { userId, amount } = command;

      // we have to de-stringyfy the amount that was injested in the engine
      const numAmount = parseFloat(amount);

      // now we have to move ahead the as we nw have to amount

      if (numAmount <= 0 || !isFinite(numAmount)) {
        console.log("The amount is too low ");

        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "AMOUNT_IS_TOO_LOW",
        });

        // every rejected or passed requets must be ack by the engine
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      const currentBalances = getOrCreateBalance(userId);

      const newBalance = (
        parseFloat(currentBalances.available_bal) + numAmount
      ).toString();

      setBalance(userId, {
        available_bal: newBalance,
        locked_bal: currentBalances.locked_bal,
      });

      console.log(
        `Engine has onrampeed the balances for this userid : ${userId} by  this amount ${numAmount}`,
      );

      await publisher.xAdd("to-backend", "*", {
        loopbackId: loopbackId,
        status: "SUCCESS",
        data: JSON.stringify({
          userId,
          available_bal: newBalance,
          locked_bal: currentBalances.locked_bal,
        }),
        error: "",
      });

      // this is the db poller that updates the postgress
      await publisher.xAdd("db-events", "*", {
        eventType: "WALLET_UPDATE",
        payload: JSON.stringify({
          userId,
          amountAvail: newBalance,
          amountLocked: currentBalances.locked_bal,
        }),
      });

      await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
      return;
}

export async function handleOffRamp(
  command: Extract<toEngine, { messageType: "OFF_RAMP" }>,
  loopbackId: string,
  streamEntryId: string,
  clientRead: { xAck: (key: string, group: string, id: string) => Promise<any> },
): Promise<void> {

      // this is the way that we destructure the command that we just defined 
      const {userId , amount} = command ;

      const amountToDeduct = parseFloat(amount);

      const currentBalances = getBalance(userId);

      


      if(!currentBalances){

        await publisher.xAdd("to-backend","*",{
          loopbackId,
          status : "REJECTED",
          data : "",
          error : "THE_USER_BALNCES_DOES_NOT_EXIST_BRO",
        });
        await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,streamEntryId);
     return;
      }

      if(parseFloat(currentBalances.available_bal) < amountToDeduct){
        await publisher.xAdd("to-backend","*",{
          loopbackId,
          status : "REJECTED",
          data : "",
          error : "BROO_YOU_DONT_HAVE_ENOUGH_BALANCE_WITHDRAW_BRO"
        });
        await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,streamEntryId);
     return;

      }

      setBalance(userId, {
        available_bal: (parseFloat(currentBalances!.available_bal) - amountToDeduct).toString(),
        locked_bal: currentBalances!.locked_bal,
      });

      await publisher.xAdd("to-backend","*",{
        loopbackId,
        status : "SUCESS",
        data : "",
        error : "THE_AMOUNT_WAS_DEDUCTED_BRO"
      });

      await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,streamEntryId);
     return; 
}

export async function handleExitPosition(
  command: Extract<toEngine, { messageType: "EXIT_POSITION" }>,
  loopbackId: string,
  streamEntryId: string,
  clientRead: { xAck: (key: string, group: string, id: string) => Promise<any> },
): Promise<void> {
      // this mesage type is basiclly an call back to the the create order type as that this is essentially
      // an aggresive order that is for the market side and with the reduce only set to true

      const { userId, marketId, orderId, qty } = command;

      const book = getOrderBook(marketId);

      if (!book) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "THE_BOOK_DOES_NOT_EXIST_BROTHER",
        });
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      // to find the postion of the user in the maekt

      const posKey = `${userId}:${marketId}`;
      const Position = getPosition(posKey);

      if (!Position) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "MARKET_NOT_FOUND_BRO",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
        return;
      }

      // now we have the postion with us lets now start to make the order that will work on the create order
      // endpoint here lets start

      const currentPositionQty = parseFloat(Position.qty);
      const currentRequestedQty = qty ? parseFloat(qty) : currentPositionQty;

      const exitSide = Position.side === "LONG" ? "ASK" : "BID";

      const exitQty = Math.min(currentRequestedQty, currentPositionQty);

      // now we have all the things to create an syntetic order
      // The terms as ioc and fok is not implemented in the engine yet we have to do that
      const DummyOrder: toEngine = {
        messageType: "CREATE_ORDER",
        orderId,
        marketId,
        userId,
        side: exitSide,
        qty: exitQty.toString(),
        price: undefined,
        leverage: Position.leverage || "1",
        reduceOnly: true,
        timeInForce: "IOC",
        orderType: "LIMIT",
      };
      // the dummy order is now created we have to pass this order to the matchiing engine now

      await publisher.xAdd("to-backend", "*", {
        loopbackId,
        status: "REJECTED",
        data: "",
        error: "EXIT_POSITION_NOT_SUPPORTED_USE_REDUCE_ONLY_ORDER",
      });

      await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
      return;
}
