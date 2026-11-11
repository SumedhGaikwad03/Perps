import { Router } from "express";

import { prisma } from "db";

import { adminMiddleWare } from "../middleWare/authMiddleware";

import { loopback } from "../loopback";

export const marketRouter = Router();


marketRouter.post("/admin/market", adminMiddleWare, async (req, res) => {
  try {
    // we destructure the incoming request into the market parameters
    const {
      symbol,
      slug,
      imgUrl,
      tickSize = "0.1",
      stepSize = "0.001",
      baseToken,
    } = req.body;

    // check for any missing arguments here
    if (!symbol || !slug || !baseToken || !imgUrl) {
      return res
        .status(400)
        .json({ message: "The body is for request is not complete bro  " });
    }

    // now to check if the tick size is vaild or not

    const numTick = Number(tickSize);
    const numStep = Number(stepSize);

    if (
      !isFinite(numTick) ||
      !isFinite(numStep) ||
      numTick <= 0 ||
      numStep <= 0
    ) {
      return res
        .status(400)
        .json({ message: "The tick and step size are not vaild bro" });
    }

    // check for dupicated markets now as the market with a similar symbol exist or not here
    const existingMarket = await prisma.market.findFirst({
      where: {
        // it checks if the symbol or slug exist in the market
        OR: [{ symbol }, { slug }],
      },
    });

    if (existingMarket) {
      return res
        .status(409)
        .json({ message: "The Market already exists bro " });
    }

    // actual market creataion happens here
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

    // at the same time er notify the engne that the market is created so that there is  no dupiction happening in the database and thr
    // in memory engine here
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
