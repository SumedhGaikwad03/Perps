import type { OrderBook } from "../types";
import { DEFAULT_BASE_TOKEN_MAP } from "../config";
import type  { OrderAcceptedPayload } from "common";
import { publisher } from "../streams/publisher";

// Master register that keeps all the order books in the engine
const orderBooks = new Map<string, OrderBook>();

// Base token market map: Maps base token ("BTC", "ETH", "SOL") to marketIds
const baseTokenToMarkets = new Map<string, string[]>(
  Object.entries(DEFAULT_BASE_TOKEN_MAP),
);

/**
 * Retrieves the OrderBook for a specific marketId. Returns undefined if not found.
 * Returns the direct OrderBook reference to preserve existing bids/asks Map operations.
 */
export function getOrderBook(marketId: string): OrderBook | undefined {
  return orderBooks.get(marketId);
}

/**
 * Registers an OrderBook for a given marketId.
 */
export function setOrderBook(marketId: string, book: OrderBook): void {
  orderBooks.set(marketId, book);
}

/**
 * Checks whether an OrderBook exists for a marketId.
 */
export function hasOrderBook(marketId: string): boolean {
  return orderBooks.has(marketId);
}

/**
 * Removes an OrderBook for a marketId from memory.
 */
export function deleteOrderBook(marketId: string): boolean {
  return orderBooks.delete(marketId);
}

/**
 * Returns total number of registered order books.
 */
export function getOrderBooksCount(): number {
  return orderBooks.size;
}

/**
 * TEMPORARY COMPATIBILITY METHOD: Exposes mutable references through Map entries
 * to preserve Phase 1 compatibility. Will be replaced by immutable snapshots in future phases.
 */
export function getAllOrderBooks(): IterableIterator<[string, OrderBook]> {
  return orderBooks.entries();
}

/**
 * Validates whether the given base token is supported in the engine's token registry.
 */
export function isBaseTokenSupported(baseToken: string): boolean {
  if (!baseToken) return false;
  return baseTokenToMarkets.has(baseToken.toUpperCase());
}

/**
 * Retrieves all registered market IDs associated with a given base token.
 */
export function getMarketsForBaseToken(baseToken: string): string[] | undefined {
  if (!baseToken) return undefined;
  return baseTokenToMarkets.get(baseToken.toUpperCase());
}

/**
 * Associates a market ID with a base token, strictly preventing duplicate entries.
 */
export function addMarketToBaseToken(baseToken: string, marketId: string): void {
  const rawBase = baseToken.toUpperCase();
  const existingMarkets = baseTokenToMarkets.get(rawBase) ?? [];
  if (!existingMarkets.includes(marketId)) {
    baseTokenToMarkets.set(rawBase, [...existingMarkets, marketId]);
  }
}

/**
 * Clears all order books and resets base token mappings (used for test resets).
 */
export function clearOrderBooks(): void {
  orderBooks.clear();
  baseTokenToMarkets.clear();
  for (const [token, markets] of Object.entries(DEFAULT_BASE_TOKEN_MAP)) {
    baseTokenToMarkets.set(token, [...markets]);
  }
}

// this is the function that would mirror open order back to the 

export function MirrorOpenOrder(order : OrderAcceptedPayload) : void {
  
if(!publisher.isOpen){
  return;
} 
// we are naming this field as with the data as order.orderId as a single user can have many orders 
publisher.hSet(`user:${order.userId}:open_orders`, order.orderId , JSON.stringify(order))
.catch((err)=> console.log("THERE HAS BEEN AN ERROR BROOO..")); 


}

export function DeleteMirrordOpenOrder(userId : string , orderId : string ){

  if(!publisher.isOpen){

    return 
  }
  publisher.hDel(`user:${userId}:open_orders`, orderId ) 
  .catch((err)=> console.log("THERE HAS BEEN ERROR AS", err));
}
