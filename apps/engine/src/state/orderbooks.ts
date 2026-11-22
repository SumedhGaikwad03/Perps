import type { OrderBook } from "../types";
import { DEFAULT_BASE_TOKEN_MAP } from "../config";
import type  { OrderAcceptedPayload } from "common";
import { publisher } from "../streams/publisher";
import { getMarkPrice } from "./prices";

// Master register that keeps all the order books in the engine
const orderBooks = new Map<string, OrderBook>();

// Base token market map: Maps base token ("BTC", "ETH", "SOL") to marketIds
const baseTokenToMarkets = new Map<string, string[]>(
  Object.entries(DEFAULT_BASE_TOKEN_MAP),
);


// this is now time to write the function that mirrors the orderbook in the engine 

export function  mirrorOrderBookDepth(marketId : string , depth = 50): void {

if(!publisher.isOpen){
  return;
}

const book = orderBooks.get(marketId);

if(!book) return ;

// we have the orderbook now 

const bids : [string , string] [] = Array.from(book.bids.entries())
// this line gives the total qutanty for that level now 
 .map(([price , level]) => [price , level.totalQty] as [string,string]) 
 //we have to remove the first level of the price level 
 .filter(([_ , qty]) => parseFloat(qty)>0)
 // time to sort them in decending order here 
 .sort((a,b)=> parseFloat(b[0]) - parseFloat(a[0]))
 .slice(0,depth);


 const asks : [string ,string][] = Array.from(book.asks.entries())
 // this will return a new array in the engine 
 .map(([price , level])=> [price ,level.totalQty] as [string,string])
 .filter(([_,qty])=> parseFloat(qty)>0)
 // sort the list in desc now 
 .sort((a,b)=> parseFloat(a[0])- parseFloat(b[0]))
 // now to splice it 
 .slice(0,depth);

// now we have a depth snapshot for the same here 

const depthSnapshot={
  marketId,
  symbol : book.symbol,
  lastTradedPrice : book.lastTradedPrice.toString(),
  markPrice: getMarkPrice(book.baseToken) || book.lastTradedPrice.toString(),
  bids,
  asks,
  timestamp : Date.now()
};

// now we have to publish that hash in the system right 
publisher.hSet(`market:${marketId}:depth`,"data", JSON.stringify(depthSnapshot))
.catch((error)=> {
console.error("There was an error in making the snahot for the engine possible as", error);
});
publisher.hSet(`market:${book.symbol}:depth`,"data", JSON.stringify(depthSnapshot))
.catch((error)=> {
console.error("There was an error in mirroring symbol depth:", error);
});

// now to broadcast that depth to the main dashborard what we can do is 

publisher.publish(`pub:depth:${marketId}`, JSON.stringify(depthSnapshot))
.catch((err)=> console.error("Error publishing depth by marketId:", err));

publisher.publish(`pub:depth:${book.symbol}`, JSON.stringify(depthSnapshot))
.catch((err)=> console.error("Error publishing depth by symbol:", err));





}
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
export function MirrorOpenOrder(order : any) : void {
  if(!publisher.isOpen){
    return;
  } 
  const payloadToStore = {
    ...order,
    filledQty: (order as any).filledQty || "0",
    status: (order as any).status || ((order as any).filledQty && parseFloat((order as any).filledQty) > 0 ? "PARTIALLY_FILLED" : "OPEN"),
  };
  // we are naming this field as with the data as order.orderId as a single user can have many orders 
  publisher.hSet(`user:${order.userId}:open_orders`, order.orderId , JSON.stringify(payloadToStore))
  .catch((err)=> console.log("THERE HAS BEEN AN ERROR BROOO.."));
}

export function DeleteMirrordOpenOrder(userId : string , orderId : string ){

  if(!publisher.isOpen){

    return ;
  }
  publisher.hDel(`user:${userId}:open_orders`, orderId ) 
  .catch((err)=> console.log("THERE HAS BEEN ERROR AS", err));
}
