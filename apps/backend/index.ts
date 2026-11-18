import express from "express";

import { authRouter } from "./coreRoutes/auth.routes";
import { orderRouter } from "./coreRoutes/order.routes";
import { marketRouter } from "./coreRoutes/market.routes";
import { collateralRouter } from "./coreRoutes/collateral.routes";
import { userRouter } from "./userRoutes/userRoutes.account";

export const app = express();

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
