/**
 * Calculates realized PnL for closed position quantity.
 * Preserves the exact calculation from updatePositionFills:
 *   LONG:  (incomingPrice - existingPrice) * closedQty
 *   SHORT: (existingPrice - incomingPrice) * closedQty
 */
export function calculateRealizedPnl(
  side: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number,
  closedQty: number,
): number {
  return side === "LONG"
    ? (exitPrice - entryPrice) * closedQty
    : (entryPrice - exitPrice) * closedQty;
}

/**
 * Calculates unrealized PnL for active position quantity against mark price.
 * Preserves the exact calculation from sweepLiquadations:
 *   LONG:  (markPrice - entryPrice) * qty
 *   SHORT: (entryPrice - markPrice) * qty
 */
export function calculateUnrealizedPnl(
  side: "LONG" | "SHORT",
  entryPrice: number,
  markPrice: number,
  qty: number,
): number {
  return side === "LONG"
    ? (markPrice - entryPrice) * qty
    : (entryPrice - markPrice) * qty;
}
