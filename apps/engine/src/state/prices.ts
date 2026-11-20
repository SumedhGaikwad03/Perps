import type { BaseToken } from "../types";
import { DEFAULT_BINANCE_FEED_MAP } from "../config";

// Map for markprices for the markets (used for calculating liquidations and funding rates)
const markPrices = new Map<string, string>();

// Binance feed mapper that maps incoming stream tokens to the engine's base tokens
const binanceFeedMap: Record<string, string> = { ...DEFAULT_BINANCE_FEED_MAP };

/**
 * Retrieves the latest mark price string for a base token (e.g. "BTC", "ETH", "SOL").
 * Returns undefined if no price tick has been received.
 */
export function getMarkPrice(baseToken: string): string | undefined {
  if (!baseToken) return undefined;
  return markPrices.get(baseToken);
}

/**
 * Updates the mark price for a base token using a string price value.
 */
export function setMarkPrice(baseToken: string, price: string): void {
  markPrices.set(baseToken, price);
}

/**
 * Checks whether a mark price is currently registered for the base token.
 */
export function hasMarkPrice(baseToken: string): boolean {
  if (!baseToken) return false;
  return markPrices.has(baseToken);
}

/**
 * Removes a mark price record from memory.
 */
export function deleteMarkPrice(baseToken: string): boolean {
  return markPrices.delete(baseToken);
}

/**
 * Returns total count of active mark prices in memory.
 */
export function getMarkPricesCount(): number {
  return markPrices.size;
}

/**
 * TEMPORARY COMPATIBILITY METHOD: Exposes mutable references through Map entries
 * to preserve Phase 1 compatibility.
 */
export function getAllMarkPrices(): IterableIterator<[string, string]> {
  return markPrices.entries();
}

/**
 * Registers an incoming Binance stream symbol to an engine BaseToken.
 */
export function registerBinanceFeed(
  binanceIncoming: string,
  baseToken: BaseToken,
): void {
  binanceFeedMap[binanceIncoming.toLowerCase()] = baseToken;
}

/**
 * Resolves an incoming Binance stream symbol to the corresponding engine BaseToken.
 */
export function getBinanceBaseToken(binanceIncoming: string): string | undefined {
  // returns the correct symbol that our exchage works upon 
  return binanceFeedMap[binanceIncoming.toLowerCase()];
}

/**
 * Generates the Binance combined stream parameter string (e.g. "btcusdt@ticker/ethusdt@ticker/solusdt@ticker").
 */
export function getBinanceStreams(): string {
  return Object.keys(binanceFeedMap)
    .map((s) => `${s}@ticker`)
    .join("/");
}

/**
 * Returns a read-only snapshot copy of the Binance feed map.
 */
export function getBinanceFeedMap(): Record<string, string> {
  return { ...binanceFeedMap };
}

/**
 * Clears all mark prices and resets Binance feed mappings (used for test resets).
 */
export function clearPrices(): void {
  markPrices.clear();
  for (const key of Object.keys(binanceFeedMap)) {
    delete binanceFeedMap[key];
  }
  Object.assign(binanceFeedMap, DEFAULT_BINANCE_FEED_MAP);
}
