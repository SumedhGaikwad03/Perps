import { createClient } from "redis";

// Redis client instance used by the engine to publish stream events and pub/sub messages
export const publisher = createClient();
