import { DefaultMrr } from "../config";

/**
 * Calculates maintenance margin required for an open position:
 * qty * markPrice * DefaultMrr
 */
export function calculateMaintenanceMargin(
  qty: number,
  markPrice: number,
  mrr: number = DefaultMrr,
): number {
  return qty * markPrice * mrr;
}

/**
 * Calculates initial margin required for a position or order:
 * (qty * price) / leverage
 */
export function calculateInitialMargin(
  qty: number,
  price: number,
  leverage: number,
): number {
  if (leverage <= 0) return 0;
  return (qty * price) / leverage;
}

/**
 * Calculates position equity:
 * initialMargin + unRealaisedPnl
 */
export function calculateEquity(
  initialMargin: number,
  unrealizedPnl: number,
): number {
  return initialMargin + unrealizedPnl;
}
