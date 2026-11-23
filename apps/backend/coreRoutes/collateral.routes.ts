import { Router } from "express";
import { loopback } from "../loopback";
import { authmiddleware } from "../middleWare/authMiddleware";

export const collateralRouter = Router();

collateralRouter.post("/onRamp", authmiddleware, async (req, res) => {
  try {
    const userId: string = req.userId!;

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

collateralRouter.post("/offRamp", authmiddleware, async (req, res) => {
  try {
    const userId = req.userId!;

    if (!req.body.amount || isNaN(parseFloat(req.body.amount)) || parseFloat(req.body.amount) <= 0) {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }

    const amount = req.body.amount.toString();

    const queuedLoopBackResponse: any = await loopback({
      messageType: "OFF_RAMP",
      userId: userId,
      amount: amount,
    });

    if (queuedLoopBackResponse?.status === "REJECTED") {
      return res.status(400).json({
        message: queuedLoopBackResponse.error || "Withdrawal rejected by engine",
        result: queuedLoopBackResponse,
      });
    }

    return res.status(200).json({
      message: "The money is withdrawn successfully",
      result: queuedLoopBackResponse,
    });
  } catch (error) {
    console.log("Error in offRamp:", error);
    return res.status(500).json({ message: "Internal server error during withdrawal", error: String(error) });
  }
});
