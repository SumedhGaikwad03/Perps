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

// this endpoint will fetch the depth of the orderbook directly from redis 
// so that we dont hit the matching engine stream and cause delay for the trades

marketRouter.get("/market/depth", async (req, res) => {
  try {
    const marketId = (req.query.marketId as string) || (req.query.id as string);
    const symbol = req.query.symbol as string;

    let targetMarketId = marketId;

    // if user passed symbol insted of market id we find the market id first
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

    // time to fetch the depth data form redis in memory mirror
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

// this endpoint pulls all the markets that are active with 24h volume and stats for the frontend

marketRouter.get("/markets", async (_req, res) => {
  try {
    const markets = await prisma.market.findMany({
      orderBy: { symbol: "asc" },
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const marketsData = await Promise.all(
      markets.map(async (m) => {
        // get the live last traded price form redis depth snapshot
        const rawDepth = await redisClient.hGet(`market:${m.id}:depth`, "data");
        const depth = rawDepth ? JSON.parse(rawDepth) : null;
        const lastTradedPrice = depth ? depth.lastTradedPrice : "0";

        // fetch live mark price from redis (Binance WebSocket feed)
        const rawMarkPrice = (await redisClient.hGet("market:markPrices", m.baseToken)) ||
                             (await redisClient.hGet(`market:${m.id}:markPrice`, "data")) ||
                             (depth?.markPrice ? String(depth.markPrice) : undefined);
        const markPrice = rawMarkPrice && parseFloat(rawMarkPrice) > 0 ? rawMarkPrice : (lastTradedPrice || "0");

        // we fetch the 24 hour fills from the db to calculate volume and high low
        const fills24h = await prisma.fill.findMany({
          where: {
            marketId: m.id,
            createdAt: { gte: oneDayAgo },
          },
          select: { price: true, qty: true },
        });

        let volume24h = 0;
        const baselinePrice = parseFloat(markPrice) > 0 ? parseFloat(markPrice) : (parseFloat(lastTradedPrice) || 0);
        let high24h = baselinePrice;
        let low24h = baselinePrice;

        if (fills24h.length > 0) {
          high24h = -Infinity;
          low24h = Infinity;
          const ltp = baselinePrice;
          for (const fill of fills24h) {
            const p = parseFloat(fill.price);
            const q = parseFloat(fill.qty);
            // Skip anomalous test fills that diverge by more than 5x or 80% from last traded price
            if (ltp > 100 && (p < ltp * 0.2 || p > ltp * 5)) continue;
            volume24h += p * q;
            if (p > high24h) high24h = p;
            if (p < low24h) low24h = p;
          }
          if (high24h === -Infinity) high24h = ltp;
          if (low24h === Infinity) low24h = ltp;
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
          markPrice,
          high24h: high24h === -Infinity ? markPrice : high24h.toString(),
          low24h: low24h === Infinity ? markPrice : low24h.toString(),
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

    // check for duplicated markets: each base token can only have one market
    const existingMarket = await prisma.market.findFirst({
      where: {
        OR: [{ symbol }, { slug }, { baseToken }],
      },
    });

    if (existingMarket) {
      return res
        .status(409)
        .json({ message: `Market already exists for base token ${baseToken} (${existingMarket.symbol})` });
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
