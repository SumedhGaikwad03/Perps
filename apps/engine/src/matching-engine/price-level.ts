import type { OpenOrder, PriceLevel } from "../types";

/**
 * Creates an empty price level.
 */
export function createPriceLevel(): PriceLevel {
  return {
    totalQty: "0",
    orders: [],
  };
}

/**
 * Inserts an order into a price level queue and updates the total quantity.
 */
export function addOrderToLevel(
  level: PriceLevel,
  order: OpenOrder,
  orderQty: number,
): void {
  level.orders.push(order);
  level.totalQty = (parseFloat(level.totalQty) + orderQty).toString();
}
