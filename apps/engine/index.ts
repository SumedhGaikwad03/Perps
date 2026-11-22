import { createClient } from "redis";
import { STREAM_KEY, ENGINE_GROUP } from "./src/config";
import { startBinanceWebSocket } from "./src/market-data";
import { startFundingRatePoller, startLiquidationPoller } from "./src/risk";
import { startEngineConsumer, publisher } from "./src/streams";
import { bootstrapEngine } from "./src/bootstrap/hydrate";

export { SUPPORTED_BASE_TOKEN, type BaseToken } from "./src/types";

// we iniataire two instances that would read and publish the message for this stream
const clientRead = createClient();
await Promise.all([clientRead.connect(), publisher.connect()]);

try {
  // we create am engine group if not already created
  await clientRead.xGroupCreate(STREAM_KEY, ENGINE_GROUP, "0", {
    MKSTREAM: true,
  });
} catch (error: any) {
  if (!error?.message?.includes("BUSYGROUP")) {
    throw error;
  }
}

// at this point hopefully redis is connected now 

// this is function re populate the engine with the things that are already stored in prisma model

await bootstrapEngine(); 

console.log("engine has started");

startFundingRatePoller();
startLiquidationPoller();
startBinanceWebSocket();

console.log("all the backgrouund daemons are now working here ");

await startEngineConsumer(clientRead);
