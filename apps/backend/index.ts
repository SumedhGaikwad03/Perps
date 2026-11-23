import express from "express";
import cors from "cors";

import { authRouter } from "./coreRoutes/auth.routes";
import { orderRouter } from "./coreRoutes/order.routes";
import { marketRouter } from "./coreRoutes/market.routes";
import { collateralRouter } from "./coreRoutes/collateral.routes";
import { userRouter } from "./coreRoutes/userRoutes.account";

export const app = express();

// enable cors for frontend clients
app.use(cors({
  origin: true,
  credentials: true,
  //options are used to enable browser seq check for the same 
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "token", "x-admin-token", "admin_secret"],
}));

app.use(express.json()); // attaches the req data to the json body 

app.use("/api/v1", authRouter);
app.use("/api/v1", orderRouter);
app.use("/api/v1", marketRouter);
app.use("/api/v1", collateralRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1", userRouter);

// Direct root routes for convenience
app.use("/live", (req, res, next) => {
  req.url = "/live";
  marketRouter(req, res, next);
});
app.use("/markets", (req, res, next) => {
  req.url = "/markets";
  marketRouter(req, res, next);
});

const PORT = process.env.PORT || 3000;

// 0.0.0.0 is an wild card endpoint as in anyone can enter or send in a request 
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Backend server listening on http://0.0.0.0:${PORT}`);
});
