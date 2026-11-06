// this is the file that is also used for db working events here
// this is batch focus file thats only job is to digest the db queue and make the persistance data pooling
//possible

import { prisma } from "db";

import { createClient } from "redis";

import type * as Payloads from "common";

const redis = createClient();

const STREAM_KEY = "db-events";
const CONSUMER_GROUP = "db-consumer-group";
const CONSUMER_NAME = "db-worker-1";

// all the variables are set here as of now
// tem to create an engine group here

async function ConnectRedis() {
  await redis.connect();
  console.log("The redis client is connected here ");

  try {
    // we should create the group that will have this key and go on

    await redis.xGroupCreate(STREAM_KEY, CONSUMER_GROUP, "0", {
      MKSTREAM: true,
    });
  } catch (error: any) {
    if (!error?.message?.includes("BUSYGROUP")) {
      console.error(
        `smile a little there is an error in creating the db group as ${error}`,
      );
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

      if (makerOrder) {
        const updatedFilledQty = (
          parseFloat(makerOrder.filledQty) + fillQtyNum
        ).toString();

        const isFullfilled = (
          parseFloat(updatedFilledQty) >= fillQtyNum
        ).toString();

        await tx.order.update({
          where: { id: fill.makerOrderId },
          data: {
            filledQty: updatedFilledQty,
            status: isFullfilled ? "FILLED" : "PARTIALLY_FILLED",
          },
        });
      }

      // now its the time for the taker order it goes like this

      const takerOrder = await tx.order.findUnique({
        where: { id: takerOrderId },
      });

      // we have to also mutilate the taker order id here

      if (takerOrder) {
        const updatedFilledQty = (
          parseFloat(takerOrder.filledQty) + totalTakerFillQty
        ).toString();

        const isFullfilled =
          parseFloat(updatedFilledQty) >= parseFloat(takerOrder.qty);

        await tx.order.update({
          where: { id: takerOrderId },
          data: {
            filledQty: updatedFilledQty,
            status: isFullfilled ? "FILLED" : "PARTIALLY_FILLED",
          },
        });
      }

      // we have handeled the the taker order here
    }
  });
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

async function handelMarketCreated(payload : Payloads.MarketCreatedPayload){

    const {marketId , tickSize,stepSize,symbol ,slug , baseToken} = payload ; 

    // we have destructured all the properties from the market 

    await prisma.market.upsert({
        where : {symbol} , 
        update : {baseToken , tickSize , stepSize},

        create : {

            id : marketId ,
            symbol,
            baseToken,
            tickSize,
            stepSize,
            slug : symbol.toLowerCase(),
        },
    });
}
