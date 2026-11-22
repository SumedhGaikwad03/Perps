import type { BaseToken } from "../types";
import {
  registerBinanceFeed,
  getBinanceBaseToken,
  getBinanceStreams,
  setMarkPrice,
  getMarkPrice,
  getAllOrderBooks,
} from "../state";
import { publisher } from "../streams/publisher";

// this is used for normalsising the binace incoming tokens
// this is for the use of users when they have to create new token for them selves
export function RegisterBinanceFeed(binanceIncoming: string, baseToken: BaseToken) {
  registerBinanceFeed(binanceIncoming, baseToken);
}

// this is the function that is used for snapshot of the system
export function startBinanceWebSocket() {
  const RESET = "\x1b[0m";
  const BRIGHT = "\x1b[1m";
  const GREEN = "\x1b[32m";
  //const YELLOW = "\x1b[33m";
  const CYAN = "\x1b[36m";
  //const RED    = "\x1b[31m";
  const MAGENTA = "\x1b[35m";
  // we retrive all the keys from the record we created

  const streams = getBinanceStreams();

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

      console.log(
        `${CYAN}[TICK]${RESET} ${tick.s.padEnd(8)} | Price: ${BRIGHT}${tick.c}${RESET}`,
      );
      const incomingToken = tick.s.toLowerCase();

      const baseToken = getBinanceBaseToken(incomingToken);

      // in the markprices map we set the base token and the correspoinding price for the same
      if (baseToken) {
        // update the base token price in the markprices map in binance here 
        setMarkPrice(baseToken, tick.c);

        // publish real-time mark price from Binance feed to Redis
        if (publisher.isOpen) {
          publisher.hSet("market:markPrices", baseToken, tick.c).catch(() => {});

          const markPayload = JSON.stringify({
            baseToken,
            markPrice: tick.c,
            timestamp: Date.now(),
          });

          publisher.publish(`pub:markPrice:${baseToken}`, markPayload).catch(() => {});

          // broadcast for each matching orderbook
          try {
            for (const [mid, book] of getAllOrderBooks()) {
              if (book.baseToken && book.baseToken.toUpperCase() === baseToken.toUpperCase()) {
                const symbolPayload = JSON.stringify({
                  marketId: mid,
                  symbol: book.symbol,
                  baseToken,
                  markPrice: tick.c,
                  timestamp: Date.now(),
                });
                publisher.publish(`pub:markPrice:${book.symbol}`, symbolPayload).catch(() => {});
                publisher.publish(`pub:markPrice:${mid}`, symbolPayload).catch(() => {});
                publisher.hSet(`market:${mid}:markPrice`, "data", tick.c).catch(() => {});
                publisher.hSet(`market:${book.symbol}:markPrice`, "data", tick.c).catch(() => {});
              }
            }
          } catch {}
        }

        console.log(
          `  ${GREEN}➔ [STATE UPDATE]${RESET} markPrices ➔ ${MAGENTA}${baseToken}${RESET}: ${GREEN}${tick.c}${RESET}`,
        );
        console.log(
          `The current markPrices is as follows :  ${getMarkPrice(baseToken)}`,
        );
        console.log(
          `---------------------------------------------------------------------------------------------------------------`,
        );
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
