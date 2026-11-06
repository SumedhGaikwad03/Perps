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

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username  and password are required" });
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
      {
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
    const {
      symbol,
      slug,
      imgUrl,
      tickSize = "0.1 ",
      stepSize = "0.001",
    } = req.body;

    if (!symbol || !slug) {
      return res
        .status(401)
        .json({ message: "The body is for request is not complete bro  " });
    }

    const token = req.headers["x-admin-token"] || req.headers.token;
    if (!token) {
      return res
        .status(401)
        .json({ message: "The body is for request is empty " });
    }
    console.log(token);
    console.log(process.env.ADMIN_SECRET);
    if (token != process.env.ADMIN_SECRET) {
      return res.status(403).json({ message: " this token is invaild broo" });
    }

    const response = await prisma.market.create({
      data: {
        slug: slug,
        symbol: symbol,
        imgUrl: imgUrl || null,
        tickSize: tickSize,
        stepSize: stepSize,
      },
    });

    const queuedLoopbackResponse = await loopback({
      messageType: "CREATE_MARKET",
      marketId: response.id,
      imgUrl: response.imgUrl || "",
      symbol: response.symbol,
      slug: response.slug,
      tickSize: tickSize,
      stepSize: stepSize,
    });
    return res.json({
      id: response.id,
      message: " well the market request has arrived as  ",
      engineStatus: queuedLoopbackResponse,
    });
  } catch (error: any) {
    console.error("Admin create market error:", error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", details: String(error) });
  }
});

app.post("/api/v1/onRamp", authmiddleware, async (req, res) => {
  const userId: string = req.userId!; // decoded by the  middleware

  console.log("req has reached loopback ");
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

    if (!qty || !side || !marketId || !orderType || !price) {
      return res
        .status(404)
        .json({
          message:
            "The market order is getting invalidated due to a lack of fields",
        });
    }

    const orderId = Bun.randomUUIDv7();

    // this request goes to the loopback function in the backend
    const queuedLoopBackResponse = await loopback({
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

    const engineReply = await loopback({
      messageType: "CANCEL_ORDER",
      userId,
      orderId,
      marketId,
    });

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
  console.log("Server is running on port 3000");
});
