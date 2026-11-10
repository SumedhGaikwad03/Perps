import { createClient } from "redis";

import type { orderSide, toEngine, DbEventMessage } from "common";
import { main, postgres } from "bun";

// we iniataire two instances that would read and publish the message for this stream
const clientRead = createClient();
const publisher = createClient();
await Promise.all([clientRead.connect(), publisher.connect()]);

const STREAM_KEY = "engine";
const ENGINE_GROUP = "engine-consumer-group";
const CONSUMER_NAME = "engine-worker-1";

try {
  // we create am engine group if not already created

  await clientRead.xGroupCreate(STREAM_KEY, ENGINE_GROUP, "0", {
    MKSTREAM: true,
  });
} catch (error: any) {
  if (!error?.message?.includes("BUSYGROUP")) {
  }
}

// these are the types that we use through out the code base
type OpenOrder = {
  userId: string;
  originalOrderId: string;
  filledQty: string;
  lockedMargin: string;
  reduceOnly: boolean;
  qty: string;
  leverage: string;
};
type PriceLevel = {
  totalQty: string;
  orders: OpenOrder[];
};

interface OrderBook {
  bids: Map<string, PriceLevel>;
  asks: Map<string, PriceLevel>;
  lastTradedPrice: number;
  marketId: string;
  baseToken: string;
  symbol: string;
  tickSize: string;
  stepSize: string;
}

interface Position {
  userId: string;
  marketId: string;
  side: "LONG" | "SHORT";
  qty: string;
  baseToken: string;
  entryPrice: string;
  margin: string;
  leverage: string;
}
// lets define the binance feed mapper that is used for mapping the prices for binance to the market we create

const BINANCE_FEED_MAP: Record<string, string> = {
  btcusdt: "BTC",
  ethusdt: "ETH",
  solusdt: "SOL",
};

// we need to add the map for markprices, for the markets ,
//this is used for calauating the liquadations this has the token prices for the token we have on the map here

const markPrices = new Map<string, string>();
// this is a master register that keeps all the order books within itself
const orderBook = new Map<string, OrderBook>();

// this is the master register for balances to keep all the balances for the users
const Balances: Map<string, { available_bal: string; locked_bal: string }> =
  new Map();

//this is the map for all the posostions that  exists in the engine
// key is userId :marketId
const Positions: Map<string, Position> = new Map();

// this is defines as the base token market map here are some predefined maps
const baseTokenToMarkets = new Map<string, string[]>([
  ["BTC", ["BTC_USD_PERP"]],
  ["ETH", ["ETH_USD_PERP"]],
  ["SOL", ["SOL_USD_PERP"]],
]);

// the confindence margin that the engine uses to check for liquadations as this is 2.5% this
// helps to build the insureance fund of the engine
const DefaultMrr = 0.025;

// the as const at the end makes this specifically as read only tokens
export const SUPPORTED_BASE_TOKEN = ["BTC", "SOL", "ETH"] as const;

export type BaseToken = (typeof SUPPORTED_BASE_TOKEN)[number];

console.log("engine has started");

// this is the funtion that is used start
const liquadation_intervals = 1000;

//this is the functionthat start the liqdation of the funding rate
const fundingRate_poller = 60 * 60 * 1000;

// this is the function that is used for liqautating the orders
async function sweepLiquadations() {
  if (Positions.size === 0 || markPrices.size === 0) return;

  // this list will store all the liquadated postions
  const liquadatedList: any[] = [];

  for (const [posKey, pos] of Positions.entries()) {
    const marketId = pos.marketId;
    const entryPrice = parseFloat(pos.entryPrice);
    const initialMargin = parseFloat(pos.margin);
    const book = orderBook.get(pos.marketId);

    if (!book) continue;
    const rawPrice = markPrices.get(book.baseToken);

    if (!rawPrice) continue;

    const markPrice = parseFloat(rawPrice);

    if (!markPrice || markPrice <= 0) {
      continue;
    }

    const qty = parseFloat(pos.qty);

    if (qty <= 0) {
      continue;
    }

    const unRealaisedPnl =
      pos.side == "LONG"
        ? (markPrice - entryPrice) * qty
        : (entryPrice - markPrice) * qty;

    const equity = initialMargin + unRealaisedPnl;

    const maintainenceMargin = qty * markPrice * DefaultMrr;

    if (equity <= maintainenceMargin) {
      Positions.delete(posKey);

      // delete the postion and the loss is taken up by the exchaange

      liquadatedList.push({
        posKey,
        userId: pos.userId,
        marketId: pos.marketId,
        equity: equity,
        mrr: maintainenceMargin,
        markPrice: rawPrice,
      });
      // we have make it real time so we have to backend or engine

      await publisher.xAdd("db-events", "*", {
        eventType: "POSITION_LIQUIDATED",
        payload: JSON.stringify({
          status: "SUCESSS",
          userId: pos.userId,
          marketId: pos.marketId,
          equity: equity,
          mrr: maintainenceMargin,
          markPrice: markPrices.get(marketId),
        }),
      });
    }
  }
}

// this is the funtion is used for funding rate
async function fundingRate() {
  // iterata over all the insalised prices in the market

  if (orderBook.size == 0) {
    return;
  }

  for (const [marketKey, orderbook] of orderBook) {
    // now we have to ierate over the entrire market one by one

    const perpPrice = orderbook.lastTradedPrice;

    const rawPrice = markPrices.get(orderbook.baseToken);

    if (!rawPrice) continue;

    const markPrice = parseFloat(rawPrice);

    let premiumRate = markPrice > 0 ? (perpPrice - markPrice) / markPrice : 0;

    //now we have to find who pays who

    premiumRate = Math.min(Math.max(premiumRate, -0.0005), 0.0005);

    if (premiumRate === 0) {
      continue;
    }

    const settlements: any[] = [];
    // now as we have the preminum rate we now have to iterate
    for (const [postionKey, pos] of Positions) {
      if (pos.marketId != marketKey) {
        continue;
      }

      const qty = parseFloat(pos.qty);

      if (qty <= 0) {
        continue;
      }

      const notinalValue = qty * markPrice;
      const paymentValue = notinalValue * Math.abs(premiumRate);

      // this line of code determines is the curret user is payable
      const isPayer =
        premiumRate > 0 ? pos.side === "LONG" : pos.side === "SHORT";

      const userBal = Balances.get(pos.userId);

      if (!userBal) {
        continue;
      }

      let currentAvail = parseFloat(userBal.available_bal);

      if (!isPayer) {
        // if the current user is not the payer then we add the payment value to the player
        currentAvail += paymentValue;
      } else {
        if (currentAvail >= paymentValue) {
          currentAvail -= paymentValue;
        }
        // the payee does not have enough to pay the other peer
        else {
          const shortfall = paymentValue - currentAvail;

          // to recover this shortfall form the paymets margin we have to do this

          // exhaust his current available
          currentAvail = 0;

          const currentMargin = parseFloat(pos.margin);

          if (currentMargin > shortfall) {
            pos.margin = (currentMargin - shortfall).toString();
            // by reducing the margin we are actually increasing the users leverage and makeing the position more vulnerable to
            // the risk for liquation as  leverage = notional/margin
            // we updated the position here
            Positions.set(postionKey, pos);
          } else {
            // if even the marigin is not enough then its bad debt wee have to cover it form our side

            const badDebt = shortfall - currentMargin;

            pos.margin = "0";

            // we have to delete the postion

            Positions.delete(postionKey);

            await publisher.xAdd("db-events", "*", {
              eventType: "POSITION_BANKRUPT",
              payload: JSON.stringify({
                userId: pos.userId,
                marketId: pos.marketId,
                side: pos.side,
                qty: pos.qty,
                badDebt: badDebt,
                reason: "FUNDING_INSOLVANCY",
              }),
            });

            console.warn(
              `[FUNDING_INSOLVANCY] has happend for this ${pos.userId} in the market ${pos.marketId} for ${badDebt}`,
            );
          }
        }
      }

      Balances.set(pos.userId, {
        available_bal: currentAvail.toString(),
        locked_bal: userBal.locked_bal,
      });
    }
  }
}

// this is used for normalsising the binace incoming tokens
function RegisterBinanceFeed(
  binanceIncoming: string,
  internalMarketId: string,
) {
  BINANCE_FEED_MAP[binanceIncoming.toLowerCase()] = internalMarketId;
}

// this function is used for update the position for the order
function updatePositionFills(
  userId: string,
  marketId: string,
  baseToken: string,
  side: "LONG" | "SHORT",
  fillQty: string,
  fillPrice: string,
  leverage: string,
) {
  // here we find the user and the market id for positions in that market here
  const posKey = `${userId}:${marketId}`;

  const existingPosition = Positions.get(posKey); 

  let incomingQty = parseFloat(fillQty);
  let incomingPrice = parseFloat(fillPrice);
  let incomingLeverage = parseFloat(leverage); 


  // if that user does not have an position open in that market then

  // this is a brand new posotion that we have opened for the user
  if (!existingPosition || parseFloat(existingPosition.qty) === 0) {
    const margin = (
      (parseFloat(fillQty) * parseFloat(fillPrice)) /
      parseFloat(leverage)
    ).toString();

    Positions.set(posKey, {
      userId,
      marketId,
      baseToken,
      side,
      qty: fillQty,
      entryPrice: fillPrice,
      margin: margin,
      leverage: leverage,
    });

    return;
  }

  // the postion in that exists in the market is  then we can do this as
  const existingQty = parseFloat(existingPosition.qty);
  const existingPrice = parseFloat(existingPosition.entryPrice);
  const existingMargin = parseFloat(existingPosition.margin);


  // now we either add into the postion or dleverage the postion

  if (existingPosition.side === side) {
    // we double down on the existing postion as we make this we incerse the stakes in the project
    const newQty = existingQty + parseFloat(fillQty);
    const avgEntryPrice =(existingQty * existingPrice + parseFloat(fillQty) * parseFloat(fillPrice)) /newQty;
    const addedMargin =(parseFloat(fillQty) * parseFloat(fillPrice)) / parseFloat(leverage);
    const totalNewMargin = existingMargin + addedMargin ;
    const totalNotianoalValue = newQty * avgEntryPrice ;

    const blendedLeverage =  totalNotianoalValue/totalNewMargin;

    // now its time to set new postions here as

    Positions.set(posKey, {
      ...existingPosition,
      qty: newQty.toString(),
      entryPrice: avgEntryPrice.toString(),
      margin: (existingMargin + addedMargin).toString(),
      leverage : blendedLeverage.toFixed(2).toString()
    });
    return;
  }


  // now the flat pipeline for handing the opposing side of orders 

  const closedQty = Math.min(existingQty,incomingQty);

  const marginReduction = (closedQty/existingQty)*existingMargin ;


  const realisedPnl =existingPosition.side === "LONG" ? (incomingPrice - existingPrice)*closedQty 
  :(existingPrice - incomingPrice)*closedQty; 


  const userBal = Balances.get(userId) || {available_bal : "0" , locked_bal : "0"};

  const newBalance = Math.max(0,parseFloat(userBal.available_bal)+marginReduction+realisedPnl);

  Balances.set(userId , {available_bal : newBalance.toString() , locked_bal : userBal.locked_bal});



  // now time for sate mutation here as for postions as 
  if(incomingQty >= existingQty){

    Positions.delete(posKey); // delete the current position 

    const leftOverQty = incomingQty - existingQty ;
 
    if(leftOverQty > 0 ){

      const leftOverMargin = (leftOverQty * incomingPrice)/ incomingLeverage;

      Positions.set(posKey , {
        userId,marketId,baseToken,side,
        qty: leftOverQty.toString(),
        margin : leftOverMargin.toString(),
        leverage,
        entryPrice : fillPrice
      });
    }
  }else{

    // if the side is opposing but there are partial fills then what we can do is 

    const remainingQty = existingQty - incomingQty ;

    const remaingMargin = Math.max(0,existingMargin-marginReduction);

    Positions.set(posKey,{
      ...existingPosition,
      qty : remainingQty.toString(),
      margin : remaingMargin.toString()

    });
  }

  // // now to handel the opposing side as
  // // as this is the term when side is not equal and the fills are higher than the required 
  // // amount 
  // if (parseFloat(fillQty) >= existingQty) {
  //   // this is the term in which we close the postion for the user which was for the current side

  //   // this is the excess qty that we have to open and oppsoing postion for 
  //   filledQty = (existingQty - parseFloat(fillQty)).toString();
  //   Positions.delete(posKey); 

  // } else {
  //   // if he is just squaring off the postion he himself made then he can absorb the sell right now
  //   const remaingQty = existingQty - parseFloat(fillQty);

  //   // calauate the new margin that this margin we have to adjust the new margin
  //   const closedQty = Math.min(existingQty, parseFloat(fillQty));
  //   // this is the amount of margin we have to reduce this much margin in the maker balance
  //   const marginReduction = (closedQty / existingQty) * existingMargin;

  //   // to check the realised pnl in the system what we can do is
  //   const realisedPnl =
  //     existingPosition.side === "LONG"
  //       ? (parseFloat(fillPrice) - existingPrice) * closedQty
  //       : (existingPrice - parseFloat(fillPrice)) * closedQty;

  //   // now time to update the users balances

  //   const userBal = Balances.get(existingPosition.userId) ?? {
  //     available_bal: "0",
  //     locked_bal: "0",
  //   };

  //   const currAvailBalance = parseFloat(userBal.available_bal);

  //   const newAvailBalance = Math.max(
  //     0,
  //     currAvailBalance + marginReduction + realisedPnl,
  //   );

  //   // time yo update the balance for the user

  //   Balances.set(existingPosition.userId, {
  //     available_bal: newAvailBalance.toString(),
  //     locked_bal: userBal.locked_bal,
  //   });

  //   // we have to mutate those positions as we move ahead as what we can do is

  //   if (parseFloat(fillQty) >= existingQty) {
  //     // then this postion is closed bro
  //     Positions.delete(posKey);

  //     // now we have to flip this position for that trader as follows

  //     const leftOverQty = parseFloat(fillQty) - existingQty;

  //     if (leftOverQty > 0) {
  //       const leftOverMargin =
  //         (leftOverQty * parseFloat(fillPrice)) / parseFloat(leverage);

  //       Positions.set(posKey, {
  //         userId,
  //         marketId,
  //         baseToken,
  //         side,
  //         qty: fillQty,
  //         entryPrice: fillPrice,
  //         margin: leftOverMargin.toString(),
  //         leverage: leverage,
  //       });
  //     }
  //   } else {
  //     // this block does when we have partial filled orders

  //     const remaningQty = existingQty - parseFloat(fillQty);
  //     const remaingMargin = Math.max(0, existingMargin - marginReduction);

  //     Positions.set(posKey, {
  //       ...existingPosition,
  //       qty: remaingQty.toString(),
  //       margin: remaingMargin.toString(),
  //     });
  //   }
  // }
}

// this is the function that is used for snapshot of the system

// this is used for the ws connection for the same
function startBinanceWebSocket() {
  // we retrive all the keys from the record we created

  const streams = Object.keys(BINANCE_FEED_MAP)
    .map((symbol) => `${symbol.toLowerCase()}@ticker`)
    .join("/");

  // this creates a stream url that will be used for the binace api

  const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  // this is the url that is used to ping the binace url that we use to get data for the project

  const webSocket = new WebSocket(wsUrl);

  webSocket.onopen = () => {
    console.log(`Binance Live Feed is connected here ${wsUrl}`);
  };

  // the web socket is now connected to the project lets start to deatructre the message

  webSocket.onmessage = (event) => {
    // right now the event object has all the data that is needed

    try {
      const message = JSON.parse(event.data.toString());

      const tick = message.data;

      // we check if the message has the symbol or the closing price here
      if (!tick?.s || !tick?.c) {
        return;
      }

      const incomingToken = tick.s.toLowerCase();

      const baseToken = BINANCE_FEED_MAP[incomingToken];

      // in the markprices map we set the base token and the correspoinding price for the same
      if (baseToken) {
        markPrices.set(baseToken, tick.c);
      }
    } catch (err) {
      console.log(`There was a internal market error`, err);
    }
  };

  webSocket.onerror = (error) => {
    console.log("binance connection error has happened", error);
  };

  webSocket.onclose = () => {
    console.log("The websocket is disconnected trying to reping in 3 sec ");

    setTimeout(() => {
      startBinanceWebSocket();
    }, 3000);
  };

  // this is the binace connection endpoint for the project
}
// used to start the liquadation poller
function startLiquidationPoller() {
  setInterval(() => {
    sweepLiquadations().catch((err) => {
      console.log("There is a big error in liquadation  broo", err);
    });
  }, liquadation_intervals);
}
// thisi is used to start the funding rate poller
function startFundingRatePoller() {
  setInterval(() => {
    fundingRate().catch((err) => {
      console.log("funding rate poller erroe", err);
    });
  }, fundingRate_poller);
}
startFundingRatePoller();
startLiquidationPoller();
startBinanceWebSocket();

console.log("all the backgrouund daemons are now working here ");

while (true) {
  try {
    // this is the snippert that read the engine queue here
    const response = await clientRead.xReadGroup(
      ENGINE_GROUP, // this is the consumer group name
      CONSUMER_NAME, // this is the stream/worker we use to read data from
      //message is tagged in the ple with the consumer_name
      [
        {
          key: "engine", // the redis stream key to consume  from
          id: ">", // this tell us that give only msg that are recent
        },
      ],
      {
        BLOCK: 0, // waits unitl a new query drops
        COUNT: 1, // reads one query at a time
      },
    );

    if (!response || !response[0]?.messages[0]) {
      console.log("nothing found in the queue broo  bad luck ig ");
      continue;
    }

    // this is the entrie redis message that is received by the consermerworkr
    const entry = response[0]?.messages[0];

    if (!entry) continue;

    console.log("engine req is reaching here ");

    // THE entry message is currently is an strinfied version of the message
    // we have to destructure it and extract the loopback id of the message
    const loopbackId = entry.message.loopbackId;

    // this has the data that we are supposed to work on
    // this is basically an type check for the message we are working with
    const command: toEngine = JSON.parse(entry.message.payload!);

    //const message : {loopbackId : string } & toEngine = entry.message;

    console.dir(response, { depth: null });

    if (command.messageType == "CREATE_ORDER") {
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

      const book = orderBook.get(marketId);
      // we extact order book from the market

      if (!book) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "MARKET_NOT_FOUND_BRO",
        });

        // to avoid reprocessing or publishing this entry here

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
        continue;
      }

      // we here extract the user balnce and all other things that are required to destructured
      const userBalance = Balances.get(userId) ?? {
        available_bal: "0",
        locked_bal: "0",
      };
      const numQty = parseFloat(qty);
      // here we infer what type of price does the user wants as its a limit price or market price
      const numPrice = price ? parseFloat(price) : book.lastTradedPrice;

      // checks if the user has given a vaild price and quantity
      if (numQty <= 0 || (orderType === "LIMIT" && (!price || numPrice <= 0))) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "INVAILD_PRICE_OR_QTY",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
        continue;
      }

      const userLeverage = command.leverage ? parseFloat(leverage) : 1;

      if (userLeverage <= 0 || !Number.isFinite(userLeverage)) {
        throw new Error("Invaild Leverage");
      }

      // check if the user needs extra margin to open an trade as is he squaring down on the current postion or opening a new posistion

      // lets now check the posotion before calculating reduce onlu for the user as if the user actually has an open posotion to that would
      //balance the squaring off the posotions

      // this snippet will give off any position that the user has in the current market,
      // this is used to check for the case of the reduce only variable
      const position = Positions.get(`${userId}:${marketId}`);

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

          await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);

          continue;
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
          continue;
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
          continue;
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
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
        continue;
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
      Balances.set(userId, {
        available_bal: (currentAvailBalance - reqMargin).toString(),
        locked_bal: (parseFloat(userBalance.locked_bal) + reqMargin).toString(),
      });

      // now the balacnece has been locked for the user , we now have to make the matching engine / work the matching engine

      // this is the quantity that is still left to be filled
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
            parseFloat(restingOrder?.qty!) -
            parseFloat(restingOrder?.filledQty!);

          // The quantity that is matched with the order is here
          const matchQty = Math.min(remaningQty, restingOrderRemaning);

          // we push the orders that are filed into quantity so right now the inmemory array has all the executed orders in the book
          fills.push({
            price: priceKey,
            qty: matchQty.toString(),
            makerOrderId: restingOrder?.originalOrderId!,
            makerUserId: restingOrder?.userId!,
            makerUserLeverage: restingOrder?.leverage! || "1",
          });

          // this is the updation in the resting order that we just filled
          restingOrder!.filledQty = (
            parseFloat(restingOrder!.filledQty) + matchQty
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
          const makerBal = Balances.get(fill.makerUserId);

          if (makerBal) {
            const lockedBalance = parseFloat(makerBal.locked_bal);
            const collateralToUnlock = (fillQty * fillPrice) / makerLeverage;
            // either the entire balce gets liquadated or the maker has zero locked bal it cant go naegative
            // so we fall back to zero
            const updatedBalance = Math.max(
              0,
              lockedBalance - collateralToUnlock,
            );

            // we also have to set the makers balances now in the memory now that is done now
            Balances.set(fill.makerUserId, {
              available_bal: makerBal.available_bal,
              locked_bal: updatedBalance.toString(),
            });
          }

          //

          // this is for the taker id
          updatePositionFills(
            userId,
            marketId,
            book.baseToken,
            takerSide,
            fill.qty,
            fill.price,
            userLeverage.toString(),
          );

          // this is for the maker id

          updatePositionFills(
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

          const currentPosition = Positions.get(posKey);

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
                leverage: "0",
                liquidationPrice: null,
              };

          await publisher.xAdd("db-events", "*", {
            eventType: "POSITION_UPDATED",
            payload: JSON.stringify(payload),
          });
        }
      }
      // this is now the post matching logic , the order that could be swapped is swaped alrady we can move ahead from here so this cycle is over

      let finalStatus: "FILLED" | "PARTIALLY_FILLED" | "OPEN" = "FILLED";

      const exuctedQty = numQty - remaningQty; // this is the amount that is still left to be executed

      if (remaningQty > 0) {
        //in case of a limit order we debralrt did not match the order as we dont have the required price but orders still exist
        if (orderType === "LIMIT") {
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
          level.totalQty = (
            parseFloat(level.totalQty) + remaningQty
          ).toString();
        } else if (orderType === "MARKET") {
          finalStatus = exuctedQty > 0 ? "PARTIALLY_FILLED" : "OPEN";

          // calculate collateral locked for unfullfiled portain
          // there is no point in holding the unused margin in this trade

          const unusedMargin = command.reduceOnly
            ? 0
            : (remaningQty * numPrice) / userLeverage;

          if (unusedMargin > 0) {
            const latestBalance = Balances.get(userId);

            Balances.set(userId, {
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

      // if the the fills happens at a better price than the price specifoed then
      // we cross check here with the spends amount and the expected ,we check it here
      if (fills.length > 0 && !command.reduceOnly) {
        const totalActualSpend = fills.reduce(
          (sum, f) =>
            sum + (parseFloat(f.qty) * parseFloat(f.price)) / userLeverage,
          0,
        );

        const expectedSpent = (exuctedQty * numPrice) / userLeverage;

        const priceImprovementRefund = expectedSpent - totalActualSpend;

        if (priceImprovementRefund > 0) {
          const latestBalance = Balances.get(userId);

          Balances.set(userId, {
            available_bal: (
              parseFloat(latestBalance!.available_bal) + priceImprovementRefund
            ).toString(),
            locked_bal: (
              parseFloat(latestBalance!.locked_bal) - priceImprovementRefund
            ).toString(),
          });
        }
      }
      // the full order is now completed its order

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

        error: " ",
      });

      // now  for db persistance what we can do is

      // find margin locked in the resting order
      const remainingOrderMargin =
        orderType === "LIMIT" && remaningQty > 0 && !command.reduceOnly
          ? (remaningQty * numPrice) / userLeverage
          : 0;

      // persist to accecpt thr order first

      await publisher.xAdd("db-events", "*", {
        eventType: "ORDER_ACCEPTED",
        payload: JSON.stringify({
          orderId,
          userId,
          marketId,

          orderType,
          orderSide: side,

          price: orderType === "LIMIT" ? price! : null,
          qty,

          timeInForce: command.timeInForce,
          reduceOnly: Boolean(command.reduceOnly),

          initialMargin: reqMargin.toString(),
          lockedMargin: remainingOrderMargin.toString(),
        }),
      });

      // the trades that actually executed
      if (fills.length > 0) {
        // we would add a seprate worker to make the db calls possible
        await publisher.xAdd("db-events", "*", {
          eventType: "TRADE_EXECUTED",
          payload: JSON.stringify({
            takerOrderId: orderId,
            takerUserId: userId,
            marketId,
            fills,
          }),
        });
      }
      // now the create order endpoint is finally done bro
      // its done BRO ;)

      await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
      continue;
    }

    if (command.messageType == "CREATE_MARKET") {
      // to calauate the markprice the mark prices should only be created on top of existince market places
      // then the mark price calaultion becomes easy and secure
      // we are extracting the market here
      const { symbol, tickSize, stepSize, marketId, baseToken, slug } = command;

      // we have to check if the duplicate market even exist

      if (orderBook.has(marketId)) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "MARKET_ALREADY_EXISTS",
        });

        // we ack the req as this req has been processed
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);

        continue;
      }

      const rawbaseToken = baseToken?.toUpperCase();

      if (!rawbaseToken || !baseTokenToMarkets.has(rawbaseToken)) {
        console.log("this base token does not exist in the project broo");

        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "BASE_TOKEN_DOES_NOT_SUPPORTED",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
        continue;
      }

      // time to piggyback the existing tokens to the already defines base tokens in the program
      const existingMarkets = baseTokenToMarkets.get(rawbaseToken) ?? [];
      baseTokenToMarkets.set(rawbaseToken, [...existingMarkets, marketId]);

      const currentMarkPrice = markPrices.get(baseToken);

      // now we have vaildated  that the engine exists then we move ahead and create an orderbook

      const newBook: OrderBook = {
        marketId,
        symbol,
        lastTradedPrice: currentMarkPrice ? parseFloat(currentMarkPrice) : 0,
        tickSize,
        stepSize,
        baseToken: baseToken,
        bids: new Map<string, PriceLevel>(),
        asks: new Map<string, PriceLevel>(),
      };

      orderBook.set(marketId, newBook);

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

      await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
      continue;
    }

    if (command.messageType == "ON_RAMP") {
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
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
        continue;
      }

      const currentBalances = Balances.get(userId) ?? {
        available_bal: "0",
        locked_bal: "0",
      };

      const newBalance = (
        parseFloat(currentBalances.available_bal) + numAmount
      ).toString();

      Balances.set(userId, {
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
        eventType: "WALLET_UPDATED",
        payload: JSON.stringify({
          userId,
          amountAvail: newBalance,
          amountLocked: currentBalances.locked_bal,
        }),
      });

      await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
      continue;
    }

    if (command.messageType == "CANCEL_ORDER") {
      // destructing the incoming request
      const { userId, marketId, orderId, side } = command;

      // we have to locate the order in the order book

      const book = orderBook.get(marketId);

      if (!book) {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "MARKET_DOES_NOT_EXISTS_BRO",
        });
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
        continue;
      }

      let foundOrder: OpenOrder | null = null;

      let orderPrice: string | null = null;

      let unfilledQty = "0";  

      let sideP : "LONG" | "SHORT" = side == "BID" ? "LONG" : "SHORT";

      let baseToken = book.baseToken;

      

      if (side !== "BID" && side !== "ASK") {
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: " ",
          error: "THE PROVIDED SIDE IS NOT VAILD VRO ",
        });

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
        continue;
      }

      if (side === "BID") {
        // the level here basically signifies that lits a sting and array of orders for that price
        for (const [priceKey, level] of book.bids.entries()) {
          // the below map and checks each order if the the order id is matching with the origonal order id
          // or the user id in the current price level
          const idx = level.orders.findIndex(
            (o) => o.originalOrderId === orderId && o.userId === userId,
          );

          // if we find the order in the array of orders that is idx is not -1
          // that means we have found the order on our own
          if (idx !== -1) {
            // We have retrived this order here
            foundOrder = level.orders[idx]!;

            orderPrice = priceKey;

            // this is the reamaing qty at the order that was found
            const unExexcutedQty = parseFloat(foundOrder.qty) - parseFloat(foundOrder.filledQty);

            // now we get the user balances for this type

            const UserBalance = Balances.get(userId) || {
              available_bal: "0",
              locked_bal: "0",
            };

            // this is the margi tied to this order by the user
            const marginToUnlock = Math.min(
              parseFloat(foundOrder.lockedMargin),
              parseFloat(UserBalance?.locked_bal),
            );

            Balances.set(userId,{
              available_bal : (parseFloat(UserBalance.available_bal) + marginToUnlock).toString(),
              locked_bal : (parseFloat(UserBalance.locked_bal)- marginToUnlock).toString(),
                         });

            // time to remove the order now

            foundOrder = level.orders.splice(idx, 1)[0]!;

            // update the quanty at the level
            level.totalQty = (
              parseFloat(level.totalQty) - unExexcutedQty
            ).toString(); 

             unfilledQty =  unExexcutedQty.toString() ;

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
            (o) => o.originalOrderId === orderId && o.userId === userId,
          );

          // if we find the order in the array of orders that is idx is not -1
          // that means we have found the order on our own
          if (idx !== -1) {
            // We have retrived this order here
            foundOrder = level.orders[idx]!;

            orderPrice = priceKey;

            // this is the reamaing qty at the order that was found
            const unExexcutedQty =
              parseFloat(foundOrder.qty) - parseFloat(foundOrder.filledQty);

            // now we get the user balances for this type

            const UserBalance = Balances.get(userId) || {
              available_bal: "0",
              locked_bal: "0",
            };

            // this is the margi tied to this order by the user
            const marginToUnlock = Math.min(
              parseFloat(foundOrder.lockedMargin),
              parseFloat(UserBalance?.locked_bal),
            );

            Balances.set(userId, {
              available_bal: (
                parseFloat(UserBalance.available_bal) + marginToUnlock
              ).toString(),
              locked_bal: (
                parseFloat(UserBalance.locked_bal) - marginToUnlock
              ).toString(),
            });

            // time to remove the order now

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

        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
        continue;
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

      await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
      continue;
    }
  } catch (err) {
    console.error("[Engine Consumer Error]:", err);
  }
}
