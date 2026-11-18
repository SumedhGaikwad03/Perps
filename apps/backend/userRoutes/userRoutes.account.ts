import { prisma } from "db";
import {createClient} from "redis"; 
import { Router } from "express";
import { authRouter } from "../coreRoutes/auth.routes";
import { authmiddleware } from "../middleWare/authMiddleware";
//import{createClient} from "redis"; 


export const userRouter = Router();

const redisClient = createClient(); 

redisClient.connect().catch((error)=> console.log("BRO THERE WAS ERROR IN THE CONNECTION TO THE CLIENT "));




// we have to fectech the real time data of the engine here under the live endpoint 

userRouter.get("/live", authmiddleware , async(req,res) => {

  try {
    const userId = req.userId! ;

    // we have extracted the user id now 
     // time to get balns and postion form the engine now 

     const [rawBalances , rawPositions, rawOpenOrders] = await Promise.all([

      // the key here is balances and then the key here is the data endpoint now 
      redisClient.hGet(`user:${userId}:balances`, "data"),
      // this line here is used to take an object with us to the for all the postion the user has 
      redisClient.hGetAll(`user:${userId}:positions`) ,
      redisClient.hGetAll(`user:${userId}:open_orders`)

     ]);

     // we now have raw balances and raw postions with the poen orders here 
     
     const openOrders = rawOpenOrders ? Object.values(rawOpenOrders).map((openString)=> JSON.parse(openString)) : [] ; 

     const  balances = rawBalances? JSON.parse(rawBalances) : { available_bal: "0", locked_bal: "0" } ;

     // this lines covert the string into actual position of the array in the system that is processed in the array 

     const  postions = rawPositions ? Object.values(rawPositions).map((posStr)=> JSON.parse(posStr)) :[] 
     

     return res.status(200).json({message : "The postions and balances for the user is as follows bro",
      status : "SUCESSS",
     data :{ postions,
      balances,
    openOrders},
     });


  }catch(error){
   
    res.status(500).json({message : `There is an internal error in the system as ${error}`});

  }
});

// these are all the orders that are useful to the user as to use as in endpoint
// this endpoint does not need to be in the engine as this can be done by in normal time mostly

userRouter.get("/Account", authmiddleware, (req, res) => {
  try {
    const userId = req.userId!;

    // we have the user id to work with now lets start to work on the things
    // this endpoint will essentially give the user the entire snapshot of his current history as 
    // this will have 2 endpoints in the 
  } catch {}
});

userRouter.get("/wallet", authmiddleware, async (req, res) => {
  try {
    const userId = req.userId!;

    // we have to find to the request of the wallet of the user

    const wallet = await prisma.wallet.findUnique({
      where: { userId: userId },
    });

    // this endpoint will fetch the user wallet in the in the schema

    if (!wallet) {
      return res.status(404).json({ message: "The wallet is not  there brooo" });
    }

    // rendendr  logic

    return res.status(200).json({ status: "SUCCESS", data: wallet });
  } catch (error) {
    res.status(500).json({ message: "The wallet was not found bro " });
  }
});

userRouter.get("/Positions", authmiddleware , async (req , res)=> {

    //i think the postion should be in the engine itself as we should not give false data to the user
    // this is last recorded postion in the engine
    // this should not be shown in the backend endpoint as this is the data that is highly volatile now
    try{
       const userId = req.userId!;
       //const marketId  = req.body;
       // as we want to find all the positions in the market for this key
       const lastKnowPosition = await prisma.position.findMany({
        where :
        { userId}
       });
       return res.status(200).json({ status: "SUCCESS", data: lastKnowPosition });
    }catch(error){
        res.status(500).json({message: "There has been an error in the internal system bro "});
    }
});

userRouter.get("/openOrders", authmiddleware, async (req, res) => {

    // this is also highly volatile data in the system we should show this in the main frame itself not here

    try{

        const userId = req.userId!;
        const rawOrders = await redisClient.hGetAll(`user:${userId}:open_orders`);
        const openOrders = rawOrders ? Object.values(rawOrders).map((s) => JSON.parse(s)) : [];
        return res.status(200).json({ status: "SUCCESS", data: openOrders });

    }catch(error){
        res.status(500).json({ message: "Error fetching open orders" });
    }
});

userRouter.get("/orderHistory", authmiddleware, async (req, res) => {
  try {
    const userId = req.userId!;

    const orderHistory = await prisma.order.findMany({
      where: { userId, status: { in: ["FILLED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json({ status: "SUCCESS", data: orderHistory });
  } catch (error) {
    res.status(500).json("There has been an internal service error now bro ");
  }
});
