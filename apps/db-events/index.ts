// this is the file that is also used for db working events here
// this is batch focus file thats only job is to digest the db queue and make the persistance data pooling
//possible

// rn the order books are in memory so that we cant accyually use these in an aggrigated format to
//do that we have to make sure that we have endpoints that would enable the dashboadrd for the user to user from
import { prisma } from "db";

import { ConnectionTimeoutError, createClient } from "redis";

import type * as Payloads from "common";

const redis = createClient();

const STREAM_KEY = "db-events";
const CONSUMER_GROUP = "db-consumer-group";
const CONSUMER_NAME = "db-worker-1";

// all the variables are set here as of now
// tem to create an engine group here

async function startWorker() {
  await redis.connect(); // this is the redis object that is used for interactating with the redis queue
  console.log("The redis client is connected here ");

  try {
    // we should create the group that will have this key and go on

    await redis.xGroupCreate(STREAM_KEY, CONSUMER_GROUP, "0", {
      MKSTREAM: true,
    });

    console.log(
      `db worker is now running with the key as ${STREAM_KEY} and with group ${CONSUMER_GROUP}`,
    );
  } catch (error: any) {
    if (!error?.message?.includes("BUSYGROUP")) {
      throw error;
    }
    console.log("DB consumer group already exists");
  }
  // time to start the redis worker now

  while (true) {
    try {
      const response = await redis.xReadGroup(
        CONSUMER_GROUP,
        CONSUMER_NAME,
        [
          {
            key: STREAM_KEY,
            id: ">",
          },
        ],
        {
          BLOCK: 2000,
          COUNT: 20,
        },
      );

      if (!response || !response[0]?.messages.length) {
        continue;
      }

      const StreamEntries = response[0].messages;

      // now we iterate over the entries that we have just received
      for (const entry of StreamEntries) {
        const eventType = entry.message.eventType as string;
        const payloadString = entry.message.payload as string;

        if (!eventType || !payloadString) {
          console.log(`The received payload is not in the correct form `);
          // we ack this message and then move on
          await redis.xAck(STREAM_KEY, CONSUMER_GROUP, entry.id);
          continue;
        }

        try {
          await processEvent(eventType, payloadString);

          // we have to ack the steam that we just ingested in the redis queue
          await redis.xAck(STREAM_KEY, CONSUMER_GROUP, entry.id);
        } catch (dbError) {
          console.error(
            `Db-worker is not working in the event ${eventType} with the id as ${entry}
             , the erroe is \n `,
            dbError,
          );
        }
      }
    } catch (loopError) {
      console.error(`there was an enexpected steam error as `, loopError);
    }
  }
}

// all the redis setup is now sorted here

// time to implement the event handlers in the the db group

//1. this is the trade executed for the event handler

async function handelTradeExecuted(payload: Payloads.TradeExecutedPayload) {
  const { takerOrderId, takerUserId, marketId, fills } = payload;

  // now we check the fills that are happening here

  if (!fills || fills.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    let totalTakerFillQty = 0; // this is the variablr as we add the amount of fill that happend in the fills

    for (const fill of fills) {
      const fillQtyNum = parseFloat(fill.qty);

      if (!Number.isFinite(fillQtyNum) || fillQtyNum <= 0) {
        throw new Error(`invaild fill quantity :${fill.qty}`);
      }

      // this is just increasing the total taker qty in the the current fill
      totalTakerFillQty += fillQtyNum;

      // insert a persistance record
      await tx.fill.create({
        data: {
          marketId,
          price: fill.price,
          qty: fill.qty,
          maker_id: fill.makerUserId,
          taker_id: takerUserId,
          maker_order_id: fill.makerOrderId,
          taker_order_id: takerOrderId,
        },
      });
      // this is an persistance

      // we have to update the resiting market order here

      const makerOrder = await tx.order.findUnique({
        where: { id: fill.makerOrderId },
      });
      // this is the order that is resting in the db table, we have to square off it or update it

      if (!makerOrder) {
        throw new Error(`Maker Order ${fill.makerOrderId} not found`);
      }

      const updatedFilledQty = Number(makerOrder.filledQty) + fillQtyNum;

      const isFullfilled = updatedFilledQty >= Number(makerOrder.qty);

      await tx.order.update({
        where: { id: fill.makerOrderId },
        data: {
          filledQty: updatedFilledQty.toString(),
          status: isFullfilled ? "FILLED" : "PARTIALLY_FILLED",
        },
      });
    }

    // now its the time for the taker order it goes like this

    const takerOrder = await tx.order.findUnique({
      where: { id: takerOrderId },
    });

    // we have to also mutilate the taker order id here

    if (!takerOrder) {
      throw new Error(`The taker order ${takerOrderId}`);
    }
    if (takerOrder) {
      const updatedFilledQty = Number(takerOrder.filledQty) + totalTakerFillQty;

      const isFullfilled = updatedFilledQty >= Number(takerOrder.qty);

      await tx.order.update({
        where: { id: takerOrderId },
        data: {
          filledQty: updatedFilledQty.toString(),
          status: isFullfilled ? "FILLED" : "PARTIALLY_FILLED",
        },
      });
    }

    // we have handeled the the taker order here
  });
}

// this is handel the accepted order

async function handelOrderAccepted(payload: Payloads.OrderAcceptedPayload) {
  const {
    userId,
    marketId,
    orderId,
    orderType,
    price,
    qty,
    timeInForce,
    reduceOnly,
    initialMargin,
    lockedMargin,
    orderSide,
  } = payload;

  // now to actualyy add that order to primsma

  await prisma.order.upsert({
    where: { id: orderId },
    update: {},

    create: {
      id: orderId,
      userId,
      marketId,

      orderType,
      orderSide,

      price,
      qty,

      timeInForce,
      reduceOnly,

      initialMargin,
      lockedMargin,

      status: "OPEN",
    },
  });

  console.log(`the order is persistaed as ${orderId}`);
}
// this is the endpoint to cancell order here
async function handelOrderCancelled(payload: Payloads.OrderCancelledPayload) {
  const { orderId } = payload;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "CANCELLED",
    },
  });
}

async function closeUserPositionsAndOrders(userId: string, marketId: string) {
  await prisma.$transaction([
    // here we zero out any active positions that the user might have
    prisma.position.updateMany({
      where: { userId, marketId },
      data: {
        size: "0",
        liquidationPrice: null,
      },
    }),

    // now to mark all the orders that the user have and set them to cancelled to the book
    prisma.order.updateMany({
      where: {
        userId,
        marketId,

        status: {
          in: ["OPEN", "PARTIALLY_FILLED"],
        },
      },
      data: {
        status: "CANCELLED",
      },
    }),
  ]);
}

async function handelPositionUpdated(payload: Payloads.PositionUpdatePayload) {
  const { userId, marketId, size, entryPrice, leverage, liquidationPrice } =
    payload;

    console.log(`saving this shi to the database ${payload}`);

  await prisma.position.upsert({
    where: {
      userId_marketId: {
        userId,
        marketId,
      },
    },
    update: {
      size,
      entryPrice,
      leverage,
      liquidationPrice,
    },
    create: {
      userId,
      marketId,
      size,
      entryPrice,
      leverage,
      liquidationPrice,
    },
  });
}
// the code below is used to handel the liquadation of postions

async function handelPositionLiquadated(
  payload: Payloads.PositionLiquidatedPayload,
) {
  const { marketId, userId } = payload;

  // we have an helper function that will assit us to make decisions

  await closeUserPositionsAndOrders(userId, marketId);
  console.log("The users postions and orders are wiped out bro ");
}

async function handelPositionBankrupt(
  payload: Payloads.PositionBankruptPayload,
) {
  const { marketId, userId } = payload;

  // we have the positions that will make decisions for us

  await closeUserPositionsAndOrders(userId, marketId);
  console.log("The users position is liquadated broo ");
}

async function handelMarketCreated(payload: Payloads.MarketCreatedPayload) {
  const { marketId, tickSize, stepSize, symbol, slug, baseToken } = payload;

  // we have destructured all the properties from the market

  await prisma.market.upsert({
    where: { symbol },
    update: { baseToken, tickSize, stepSize },

    create: {
      id: marketId,
      symbol,
      baseToken,
      tickSize,
      stepSize,
      slug: slug.toString(),
    },
  });
}

async function processEvent(eventType: string, rawPayload: string) {
  const payload = JSON.parse(rawPayload);

  switch (eventType) {
    case "TRADE_EXECUTED":
      await handelTradeExecuted(payload as Payloads.TradeExecutedPayload);
      break;

    case "ORDER_CANCELLED":
      await handelOrderCancelled(payload as Payloads.OrderCancelledPayload);
      break;

    case "POSITION_LIQUIDATED":
      await handelPositionLiquadated(
        payload as Payloads.PositionLiquidatedPayload,
      );
      break;

    case "POSITION_UPDATED":
      await handelPositionUpdated(payload as Payloads.PositionUpdatePayload);
      break;   

    case "POSITION_BANKRUPT":
      await handelPositionBankrupt(payload as Payloads.PositionBankruptPayload);
      break;

    case "MARKET_CREATED":
      await handelMarketCreated(payload as Payloads.MarketCreatedPayload);
      break;

    case "ORDER_ACCEPTED":
      await handelOrderAccepted(payload as Payloads.OrderAcceptedPayload);
      break;

    case "WALLET_UPDATE":
      await handelWalletUpdate(payload as Payloads.WalletTransactionPayload);
      break;

    default:
      console.warn(`[db-worker], this event ${eventType} is not supported`);
  }
}

async function handelWalletUpdate(payload: Payloads.WalletTransactionPayload) {
  //destructing the payload here

  const { userId, amountAvail, amountLocked } = payload;

  // now we have to use these things to make the operation possible

  await prisma.wallet.upsert({
    where: { userId },

    update: { amountAvail, amountLocked },

    create: {
      userId: userId,
      amountAvail: amountAvail,
      amountLocked: amountLocked,
    },
  });

  // this has the ;logic for the wallet incerments
}

startWorker().catch((err) => {
  console.error("fatal startup error broo", err);
  process.exit(1); // exit with failure here
});
