import { Router} from "express"; 

import { loopback } from "../loopback";
import { authmiddleware } from "../middleWare/authMiddleware";

export const collateralRouter = Router();


collateralRouter.post("/onRamp", authmiddleware, async (req, res) => {
  try {
    const userId: string = req.userId!; // decoded by the  middleware

    console.log("req has reached loopback ");

    // these are the type checks that are require to make sure all the system is working fine 
    const findAmount = req.body.amount;
    if (
      findAmount === null ||
      findAmount === undefined ||
      Array.isArray(findAmount) ||
      typeof findAmount === "object" ||
      typeof findAmount === "boolean" ||
      (typeof findAmount === "string" && findAmount.trim() === "")
    ) {
      return res.status(400).json("Invalid amount format");
    }

    const numAmount = Number(findAmount);
    if (!Number.isFinite(numAmount) || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json("The amount is negative or invalid broo");
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
  } catch (error) {
    console.log("There has been an Onramp error as  : ", error);
    return res.status(500);
  }
});

collateralRouter.post("/offRamp",authmiddleware, async (req , res ) => {

  try {
// this is the function that is used to of load the balances of the user 

// extarcting thr user id from the middle layers 
const userId = req.userId!;

const amount = req.body.amount.toString(); 

// supposer we vaildated the req of the if the userid and amount are not the same 

const queuedLoopBackResponse = await loopback({

  messageType : "OFF_RAMP",
  userId : userId,
  amount : amount,
}) ; 

if(queuedLoopBackResponse){
  console.log("yooooo you got the money right ? ");
}

return res.status(200).json({message: "the money is withdrawn broo" , result : queuedLoopBackResponse});

  }catch(error){

    console.log("Broo there has been an erroe as ",error);
    return res.status(500).json({message: "Broo there has been an erroe as ",error});
  }












}); 
