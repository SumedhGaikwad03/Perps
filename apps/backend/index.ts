import express from "express";
import cors from "cors";

import { authRouter } from "./coreRoutes/auth.routes";
import { orderRouter } from "./coreRoutes/order.routes";
import { marketRouter } from "./coreRoutes/market.routes";
import { collateralRouter } from "./coreRoutes/collateral.routes";
import { userRouter } from "./userRoutes/userRoutes.account";

export const app = express();

// enable cors for frontend clients
app.use(cors({
  origin: true,
  credentials: true,
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

const PORT = process.env.PORT || 3000 ;

app.listen(3000, () => {
  console.log("server is running on port 3000 broo")
});
