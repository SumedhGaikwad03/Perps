import { Router} from "express"; 

import { loopback } from "../loopback";
import { authmiddleware } from "../middleWare/authMiddleware";

export const collateralRouter = Router();


collateralRouter.post("/onRamp", authmiddleware, async (req, res) => {
  try {
    const userId: string = req.userId!; // decoded by the  middleware

    console.log("req has reached loopback ");

    const findAmount = req.body.amount;
    if (findAmount <= 0 || !isFinite(parseFloat(findAmount))) {
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
  } catch (error) {
    console.log("There has been an Onramp error as  : ", error);
    return res.status(500);
  }
});
