import type { toEngine } from "common";
import { STREAM_KEY, ENGINE_GROUP } from "../config";
import { getOrderBook, getPosition } from "../state";
import { publisher } from "../streams/publisher";
import { executeMatchingFunction } from "../matching-engine";

export async function handleExitPosition(
  command: Extract<toEngine, { messageType: "EXIT_POSITION" }>,
  loopbackId: string,
  streamEntryId: string,
  // we import the entire redis client instance altogether 
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

      if (!Position || parseFloat(Position.qty) <= 0){
        await publisher.xAdd("to-backend", "*", {
          loopbackId,
          status: "REJECTED",
          data: "",
          error: "YOUR_POSITION_IN_MARKET_NOT_FOUND_BRO",
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
        timeInForce: "IOC", // all the qty that remains will be handeld by the insurence fund of the engine 
        orderType: "MARKET", // we always exit at the market right bro ? 
      };
      // the dummy order is now created we have to pass this order to the matchiing engine now
   
      // if the order below fails then we have to implement ADL  in the system 
      await executeMatchingFunction(DummyOrder , loopbackId , streamEntryId);

 // now everthing is handeled by the engine 
    
       await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, streamEntryId);
      return;
    }

    
