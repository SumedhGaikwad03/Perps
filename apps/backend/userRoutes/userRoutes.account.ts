import { prisma } from "db";
import {createClient} from "redis"; 
import { Router } from "express";
import { authRouter } from "../coreRoutes/auth.routes";
import { authmiddleware } from "../middleWare/authMiddleware";

export const userRouter = Router();

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
      res.status(404).json({ message: "The wallet is not  there brooo" });
    }

    // rendendr  logic

    return wallet;
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
    }catch(error){
        res.status(500).json({message: "There has been an error in the internal system bro "});
    }
});

userRouter.get("/openOrders",authmiddleware,(req,res)=> {

    // this is also highly volatile data in the system we should show this in the main frame itself not here

    try{

        const userId = req.userId;


    }catch{

    }
});

userRouter.get("/orderHistory", authmiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const orderHistory = await prisma.order.findMany({
      where: { userId, status: "FILLED" },
    });
  } catch (error) {
    res.status(500).json("There has been an internal service error now bro ");
  }
});
