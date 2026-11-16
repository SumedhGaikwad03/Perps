import express from "express";

import { authRouter } from "./routes/auth.routes";
import { orderRouter } from "./routes/order.routes";
import { marketRouter } from "./routes/market.routes";
import { collateralRouter } from "./routes/collateral.routes";

export const app = express();

app.use(express.json()); // attaches the req data to the json body 

app.use("/api/v1", authRouter);
app.use("/api/v1", orderRouter);
app.use("/api/v1", marketRouter);
app.use("/api/v1", collateralRouter);

const PORT = process.env.PORT || 3000 ;

app.listen(3000, () => {
  console.log("server is running on port 3000 broo")
});
