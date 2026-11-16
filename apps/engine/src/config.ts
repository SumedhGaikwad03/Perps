// Exact configuration constants extracted from apps/engine/index.ts

export const STREAM_KEY = "engine";
export const ENGINE_GROUP = "engine-consumer-group";
export const WORKER_NAME = "engine-worker-1";

export const DefaultMrr = 0.025;
export const liquadation_intervals = 1000;
export const fundingRate_poller = 60 * 60 * 1000;

export const DEFAULT_BASE_TOKEN_MAP: Record<string, string[]> = {
  BTC: ["BTC_USD_PERP"],
  ETH: ["ETH_USD_PERP"],
  SOL: ["SOL_USD_PERP"],
};

export const DEFAULT_BINANCE_FEED_MAP: Record<string, string> = {
  btcusdt: "BTC",
  ethusdt: "ETH",
  solusdt: "SOL",
};

// Console formatting codes
export const RESET = "\x1b[0m";
export const BRIGHT = "\x1b[1m";
export const CYAN = "\x1b[36m";
export const GREEN = "\x1b[32m";
export const MAGENTA = "\x1b[35m";
export const YELLOW = "\x1b[33m";
export const RED = "\x1b[31m";
