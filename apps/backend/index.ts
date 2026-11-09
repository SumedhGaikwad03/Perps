import express, { response } from "express";
import { prisma } from "db"; // or your custom db import
import jwt from "jsonwebtoken";
import { authmiddleware } from "./authMiddleware";
import { createClient } from "redis";
import { loopback } from "./loopback";
import { concatArrayBuffers, Image } from "bun";
import { Command } from "ioredis";

const client = createClient();
client.connect();

const app = express();
app.use(express.json()); // Essential for parsing JSON bodies in POST requests

app.post("/api/v1/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || typeof username !== "string") {
      return res
        .status(400)
        .json({ error: "Username  and password are required" });
    }

     // we check for dupicate username here in the database 
    const userExist = await prisma.user.findUnique({

      where : {
        username : username ,
      }

    });

    if(userExist){

      return res.status(409).json("This username already exist broo");
    }


    //hash the password with bun
    const hashPassword = await Bun.password.hash(password);

    // this is db event that stoes the user object in the schema
    const response = await prisma.user.create({
      data: {
        username: username,
        password: hashPassword,
        wallet: {
          create: {
            amountAvail: "0",
            amountLocked: "0",
          },
        },
      },
    });

    res.status(201).json({
      id: response.id,
      message: "You have created an id here ",
    });
  } catch (e) {
    console.error(e);

    res
      .status(500)
      .json({ error: "Internal Server Error", details: String(e) });
  }
});

app.post("/api/v1/signin", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const User = await prisma.user.findUnique({
      where: {
        username: username,
      },
    });

    if (!User) {
      return res
        .status(401)
        .json({ message: "This user does not exists broo " });
    }
 
    // we kinda de-hash the password to verify it with the given password by the user 
    const isPasswordVaild = await Bun.password.verify(password, User!.password);

    if (!isPasswordVaild) {
      return res
        .status(401)
        .json({ message: "The password or username  is wrong brooo " });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }

    // give user a signed token that is valid for 8h through which all the requests could be vaildated
    const token = jwt.sign(
      { // this is the data we are storing inside the token 
        userId: User!.id,
      },
      secret,
      { expiresIn: "8h" },
    );

    return res.status(200).json({
      id: User!.id,
      token,
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: String(e) });
  }
});

app.post("/api/v1/admin/market", authmiddleware, async (req, res) => {
  try {

    // check for admin token 

     const adminToken = req.headers.admin_secret;
    if (!adminToken) {
      return res
        .status(401)
        .json({ message: "The body is for request is empty " });
    }
    console.log(adminToken);
    console.log(process.env.ADMIN_SECRET);
    if (adminToken != process.env.ADMIN_SECRET) {
      return res.status(403).json({ message: " this token is invaild broo" });
    }


    // we destructure the incoming request into the market parameters 
    const {
      symbol,
      slug,
      imgUrl,
      tickSize = "0.1",
      stepSize = "0.001",
      baseToken ,
    } = req.body;

    if (!symbol || !slug || !baseToken || !imgUrl ) {
      return res
        .status(400)
        .json({ message: "The body is for request is not complete bro  " });
    }

    // now to check if the tick size is vaild or not 

    const numTick = Number(tickSize);
    const numStep = Number(stepSize);

    if(!isFinite(numTick) ||!isFinite(numStep)|| numTick <= 0 || numStep <= 0){

      return res.status(400).json({message : "The tick and step size are not vaild bro"});

    }
    
    // check for dupicated markets now 

    const existingMarket = await prisma.market.findFirst({
      where : {
 // it checks if the symbol or slug exist in the market 
        OR : [
          {symbol},
          {slug},
        ],
      }
    });

    if(existingMarket){

      return res.status(409).json({message: "The Market already exists bro "})
    }

   

    const response = await prisma.market.create({
      data: {
        slug: slug,
        symbol: symbol,
        imgUrl: imgUrl || null,
        tickSize: tickSize,
        stepSize: stepSize,
        baseToken: baseToken,
      },
    });

    const queuedLoopbackResponse = await loopback({
      messageType: "CREATE_MARKET",
      marketId: response.id,
      imgUrl: response.imgUrl || "",
      symbol: response.symbol,
      slug: response.slug,
      tickSize: response.tickSize,
      stepSize: response.stepSize,
      baseToken: baseToken,
    });
    return res.json({
      id: response.id,
      message: " well the market request has arrived as  ",
      engineStatus: queuedLoopbackResponse,
    });
  } catch (error: any) {
    console.error("Admin create market error:", error);

    if (error.code === "P2002") {
      return res.status(409).json({
        message: "Market already exists",
      });
    }

    return res
      .status(500)
      .json({ error: "Internal Server Error", details: String(error) });
  }
});

app.post("/api/v1/onRamp", authmiddleware, async (req, res) => {
  const userId: string = req.userId!; // decoded by the  middleware

  console.log("req has reached loopback ");

  const findAmount =req.body.amount;
  if(findAmount <= 0 || !isFinite(parseFloat(findAmount))){

    return res.status(400).json("The amount is negative broo");
  }
  const queuedLoopbackResponse = await loopback({
    messageType: "ON_RAMP",
    amount: req.body.amount.toString(),
    userId: userId,
  });

  if (queuedLoopbackResponse) {
    console.log(`money deposited in da bank `);
  }

  return res.status(200).json({
    message: "onramp is done ",
    result: queuedLoopbackResponse,
  });
});

app.post(`/api/v1/order`, authmiddleware, async (req: any, res) => {
  // we extarct the user id from the jwt middleware
  try {
    const userId = req.userId;
    // we extract all the things that we need for the order to be placed form the body of the req
    const {
      marketId,
      qty,
      side,
      leverage = 1,
      orderType,
      timeInForce = "GTC",
      reduceOnly = false,
      price,
    } = req.body;

    const isSideTrue = side === "BID" || side === "ASK" ; 

    const isOrderTypeVaild = orderType === "LIMIT" || orderType === "MARKET" ; 

    const numQty = Number(qty);

    const numLeverage = Number(leverage);

    const numPrice = Number(price); 

    const isQtyVaild = Number.isFinite(numQty) && numQty >0 ;

    const isLeverageVaild = Number.isFinite(numLeverage) && numLeverage > 0 ;

    const isPriceVaild = orderType === "MARKET" || orderType === "LIMIT" && price !== undefined && price != null && Number.isFinite(numPrice)&& numPrice>0

   // const isPriceVaild = price ? (if(orderType == "MARKET") { true } ;) : false 
    if (!isQtyVaild || !isSideTrue || !marketId || !isOrderTypeVaild || !isLeverageVaild || !isPriceVaild  ) {
      return res
        .status(400)
        .json({
          message:
            "The market order is getting invalidated due to a lack of fields",
        });
    }

    

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

app.delete(`/api/v1/order/:orderId`, authmiddleware, async (req: any, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.params;
    const { marketId } = req.body;

    if (!orderId || !marketId) {
      return res.status(404).json("Market_id or orderId is needed bro");
    }

    const engineReply : any  = await loopback({
      messageType: "CANCEL_ORDER",
      userId,
      orderId,
      marketId,
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

// app.post("/api/v1/engine/liquidations" , authmiddleware , async(req : any , res ) => {
//    try {

//     const {marketId , markPrice} = req.body ;

//     if(!marketId || !markPrice){

//         return res.status(400).json({message : "marketId  and markPrice are required broo"});
//     }

//     const result = await loopback({
//         messageType : "CHECK_LIQUIDATIONS" ,
//         marketId ,
//         markPrice : markPrice.toString(),
//     });

//     return res.status(200).json(result);

//    }catch(error : any ){

//     return res.status(500).json({error :"Internal server error ", details : String(error)});
//    }
// });

app.listen(3000, () => {
  console.log("Server is running on port 3000 broo ");
});
