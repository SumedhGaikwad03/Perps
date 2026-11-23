import Decimal from "decimal.js";

// Precision validation utilities for market step size and tick size.
// Uses exact Decimal math to prevent floating point modulo errors.

export function isValidStepSize(qty: number | string, stepSize?: string): boolean {
  if (!stepSize) return true;
  try {
    const dQty = new Decimal(qty);
    const dStep = new Decimal(stepSize);
    if (dQty.lt(dStep)) return false;
    const rem = dQty.mod(dStep);
    return rem.isZero() || rem.abs().lt("1e-12") || dStep.minus(rem.abs()).lt("1e-12");
  } catch {
    return false;
  }
}

export function isValidTickSize(price: number | string, tickSize?: string): boolean {
  if (!tickSize) return true;
  try {
    const dPrice = new Decimal(price);
    const dTick = new Decimal(tickSize);
    const rem = dPrice.mod(dTick);
    return rem.isZero() || rem.abs().lt("1e-12") || dTick.minus(rem.abs()).lt("1e-12");
  } catch {
    return false;
  }
}
