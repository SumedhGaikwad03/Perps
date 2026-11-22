
import { Router } from "express";
import { loopback } from "../loopback";
import { authmiddleware } from "../middleWare/authMiddleware";

export const orderRouter = Router();

orderRouter.post(`/order`, authmiddleware, async (req: any, res) => {
  // we extarct the user id from the jwt middleware
  try {
    const userId = req.userId;
    // we extract all the things that we need for the order to be placed form the body of the req
    const {
      marketId,
      qty,
      side,
      leverage = 1, // this is the default fallback leverage 
      orderType,
      timeInForce = "GTC", // this is the default fall back time in force command 
      reduceOnly = false,  // default commands as when the user is sure to open a new postion in the market 
      price,
    } = req.body;

    // check every incoming order stream if the fields are valid or not
    if (!marketId || typeof marketId !== "string" || marketId.trim() === "") {
      return res.status(400).json({ message: "Invalid marketId" });
    }

    if (side !== "BID" && side !== "ASK") {
      return res.status(400).json({ message: "Invalid order side" });
    }

    if (orderType !== "LIMIT" && orderType !== "MARKET") {
      return res.status(400).json({ message: "Invalid orderType" });
    }

    if (timeInForce !== "GTC" && timeInForce !== "FOK") {
      return res.status(400).json({ message: "Invalid timeInForce" });
    }

    if (req.body.reduceOnly !== undefined && typeof req.body.reduceOnly !== "boolean") {
      return res.status(400).json({ message: "Invalid reduceOnly type" });
    }

    if (
      qty === null ||
      qty === undefined ||
      Array.isArray(qty) ||
      typeof qty === "object" ||
      typeof qty === "boolean" ||
      (typeof qty === "string" && qty.trim() === "")
    ) {
      return res.status(400).json({ message: "Invalid quantity format" });
    }
    const numQty = Number(qty);
    if (!Number.isFinite(numQty) || isNaN(numQty) || numQty <= 0) {
      return res.status(400).json({ message: "Invalid quantity value" });
    }

    if (
      leverage === null ||
      Array.isArray(leverage) ||
      typeof leverage === "object" ||
      typeof leverage === "boolean"
    ) {
      return res.status(400).json({ message: "Invalid leverage format" });
    }
    const numLeverage = Number(leverage);
    if (!Number.isFinite(numLeverage) || isNaN(numLeverage) || numLeverage <= 0) {
      return res.status(400).json({ message: "Invalid leverage value" });
    }

    if (orderType === "LIMIT") {
      if (
        price === null ||
        price === undefined ||
        Array.isArray(price) ||
        typeof price === "object" ||
        typeof price === "boolean" ||
        (typeof price === "string" && price.trim() === "")
      ) {
        return res.status(400).json({ message: "Invalid price format" });
      }
      const numPrice = Number(price);
      if (!Number.isFinite(numPrice) || isNaN(numPrice) || numPrice <= 0) {
        return res.status(400).json({ message: "Invalid price value" });
      }
    } else if (price !== undefined && price !== null && price !== "" && price !== "0") {
      const numPrice = Number(price);
      if (!Number.isFinite(numPrice) || isNaN(numPrice) || numPrice <= 0) {
        return res.status(400).json({ message: "Invalid price value" });
      }
    }


    
   // generate an order id that propagated throught the system and gives us an id for the order mech 

    const orderId = Bun.randomUUIDv7();

    // this request goes to the loopback function in the backend
    const queuedLoopBackResponse : any  = await loopback({
      messageType: "CREATE_ORDER",
      side: side,
      qty: qty.toString(),
      leverage: leverage,
      orderId: orderId,
      orderType: orderType,
      price: price,
      timeInForce: timeInForce,
      reduceOnly: reduceOnly,
      marketId: marketId,
      userId: userId,
    });

    
    if(queuedLoopBackResponse.status === "REJECTED"){

      const isMarketMissing = queuedLoopBackResponse.error === "MARKET_NOT_FOUND_BRO";

      return res.status(isMarketMissing ? 404 : 400).json({
        message : queuedLoopBackResponse.error,
      });
    }

    return res.status(200).json({
      
      orderId,
      message: "The engine has replayed with this",
      result: queuedLoopBackResponse,
    });
  } catch (error) {
    console.log(`There was a error creating the order as ${error}`);
    return res
      .status(500)
      .json({ message: " Internal Server Error ", details: String(error) });
  }
});

orderRouter.delete(`/order/:orderId`, authmiddleware, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.params;
    const { marketId } = req.body;
    const {side} = req.body;

    if (!orderId || !marketId) {
      return res.status(404).json("Market_id or orderId is needed bro");
    }

    const engineReply : any  = await loopback({
      messageType: "CANCEL_ORDER",
      userId,
      orderId,
      marketId,
      side , 
    });

    if(engineReply.status === "REJECTED"){

      const error = engineReply.error;

      

      return res.status(404).json({error});


    }

  

    // this is the line that executes when the loop back
    return res.status(200).json({
      succes: true,
      message: "Order cancelled succesfully",
      result: engineReply,
    });
  } catch (error) {
    console.error("cancelled api order ", error);
    return res.status(500).json({
      error: "Internal service error",
    });
  }
}); 

// this is the route that is used to exit an current postion in the market as an exit order is basically an
// aggrasive order with the reduce only part is true 

orderRouter.post(`/exitPosition`, authmiddleware, async (req: any, res) => {
  try {
    // this is the way to destructure the request that is sent by the user here 
    const userId = req.userId;
    const { marketId, qty } = req.body;

    if (!marketId ) {
      return res.status(403).json({ message: " The market does not exists bro  " });
    }

    if (!Number(qty)) {
      return res.status(400).json({ message: "Invaild status qutanty" });
    }

    // now all the vaules are extarted its time to start now 
    const orderId = Bun.randomUUIDv7();

    // this request is sent to the engine now via the loopback file which give this req an id here 
    const engineReply: any = await loopback({
      messageType: "EXIT_POSITION",
      userId,
      marketId,
      orderId,
      // we have to define the qty as the suppiled qty or we can just assume all of the qty is sent by the user 
      qty: qty ? qty.toString() : undefined,
    });

    if (engineReply?.status === "REJECTED") {
      return res.status(400).json({ message: engineReply.error || "Exit position rejected" });
    }

    return res.status(200).json({
      orderId,
      message: "Exit position requested",
      result: engineReply,
    });
  } catch (error) {
    console.error("exit position error:", error);
    return res.status(500).json({ message: "Internal Server Error", details: String(error) });
  }
});