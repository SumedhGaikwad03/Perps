import { Router } from "express";
import { createClient } from "redis";
import { prisma } from "db";

import { adminMiddleWare } from "../middleWare/authMiddleware";

import { loopback } from "../loopback";

export const marketRouter = Router();

const redisClient = createClient();
redisClient.connect().catch((err) => {
  console.error("Redis connection error in market.routes:", err);
});

/**
 * GET /api/v1/market/depth
 * Fetches real-time L2 orderbook snapshot (bids & asks) from Redis mirror
 */
marketRouter.get("/market/depth", async (req, res) => {
  try {
    const marketId = (req.query.marketId as string) || (req.query.id as string);
    const symbol = req.query.symbol as string;

    let targetMarketId = marketId;

    if (!targetMarketId && symbol) {
      const market = await prisma.market.findUnique({
        where: { symbol },
        select: { id: true },
      });
      if (!market) {
        return res.status(404).json({ success: false, message: "Market not found" });
      }
      targetMarketId = market.id;
    }

    if (!targetMarketId) {
      return res.status(400).json({
        success: false,
        message: "marketId or symbol is required",
      });
    }

    const rawDepth = await redisClient.hGet(`market:${targetMarketId}:depth`, "data");

    if (!rawDepth) {
      return res.status(200).json({
        success: true,
        data: {
          marketId: targetMarketId,
          bids: [],
          asks: [],
          lastTradedPrice: "0",
          timestamp: Date.now(),
        },
      });
    }

    const depth = JSON.parse(rawDepth);
    return res.status(200).json({
      success: true,
      data: depth,
    });
  } catch (error) {
    console.error("Error in /market/depth:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error fetching orderbook depth",
    });
  }
});

/**
 * GET /api/v1/markets
 * Returns all active markets with 24h stats and latest prices
 */
marketRouter.get("/markets", async (_req, res) => {
  try {
    const markets = await prisma.market.findMany({
      orderBy: { symbol: "asc" },
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const marketsData = await Promise.all(
      markets.map(async (m) => {
        const rawDepth = await redisClient.hGet(`market:${m.id}:depth`, "data");
        const depth = rawDepth ? JSON.parse(rawDepth) : null;
        const lastTradedPrice = depth ? depth.lastTradedPrice : "0";

        const fills24h = await prisma.fill.findMany({
          where: {
            marketId: m.id,
            createdAt: { gte: oneDayAgo },
          },
          select: { price: true, qty: true },
        });

        let volume24h = 0;
        let high24h = parseFloat(lastTradedPrice) || 0;
        let low24h = parseFloat(lastTradedPrice) || 0;

        if (fills24h.length > 0) {
          high24h = -Infinity;
          low24h = Infinity;
          for (const fill of fills24h) {
            const p = parseFloat(fill.price);
            const q = parseFloat(fill.qty);
            volume24h += p * q;
            if (p > high24h) high24h = p;
            if (p < low24h) low24h = p;
          }
        }

        return {
          id: m.id,
          symbol: m.symbol,
          slug: m.slug,
          baseToken: m.baseToken,
          tickSize: m.tickSize,
          stepSize: m.stepSize,
          imgUrl: m.imgUrl,
          lastTradedPrice,
          high24h: high24h === -Infinity ? lastTradedPrice : high24h.toString(),
          low24h: low24h === Infinity ? lastTradedPrice : low24h.toString(),
          volume24h: volume24h.toFixed(2),
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: marketsData,
    });
  } catch (error) {
    console.error("Error in /markets:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error fetching markets",
    });
  }
});


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

    const SUPPORTED_BASE_TOKENS = ["BTC", "SOL", "ETH"];
    if (!SUPPORTED_BASE_TOKENS.includes(baseToken)) {
      return res
        .status(400)
        .json({ message: "Unsupported base token bro" });
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
