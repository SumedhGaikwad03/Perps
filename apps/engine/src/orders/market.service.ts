import type { toEngine } from "common";
import type { OrderBook, PriceLevel } from "../types";
import { STREAM_KEY, ENGINE_GROUP } from "../config";
import {
  hasOrderBook,
  setOrderBook,
  isBaseTokenSupported,
  addMarketToBaseToken,
  getMarkPrice,
  mirrorOrderBookDepth,
} from "../state";
import { publisher } from "../streams/publisher";

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

      mirrorOrderBookDepth(marketId);
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
