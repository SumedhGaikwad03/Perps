
import { Router } from "express";
import { loopback } from "../loopback";
import { authmiddleware } from "../middleWare/authMiddleware";

export const orderRouter = Router();

orderRouter.post(`/api/v1/order`, authmiddleware, async (req: any, res) => {
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

    // check every incoming order stream if the stram is vaild or not 

    const isSideTrue = side === "BID" || side === "ASK" ; 

    const isOrderTypeVaild = orderType === "LIMIT" || orderType === "MARKET" ; 

    const numQty = Number(qty);

    const numLeverage = Number(leverage);

    const numPrice = Number(price); 

    const isQtyVaild = Number.isFinite(numQty) && numQty >0 ;

    const isLeverageVaild = Number.isFinite(numLeverage) && numLeverage > 0 ;

    const isPriceVaild = orderType === "MARKET" || orderType === "LIMIT" && price !== undefined && price != null && Number.isFinite(numPrice)&& numPrice>0

 
    if (!isQtyVaild || !isSideTrue || !marketId || !isOrderTypeVaild || !isLeverageVaild || !isPriceVaild  ) {
      return res
        .status(400)
        .json({
          message:
            "The market order is getting invalidated due to a lack of fields or wrong fields ",
        });
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