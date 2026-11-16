/**
 * Precision validation utilities for market step size and tick size.
 * Preserves the exact precision formulas used in CREATE_ORDER:
 *   - stepSize: numQty >= step
 *   - tickSize: Math.abs(tickMultiple - Math.round(tickMultiple)) <= 1e-5
 */

export function isValidStepSize(numQty: number, stepSize?: string): boolean {
  if (!stepSize) return true;
  const step = parseFloat(stepSize);
  return numQty >= step;
}

export function isValidTickSize(numPrice: number, tickSize?: string): boolean {
  if (!tickSize) return true;
  const tick = parseFloat(tickSize);
  const tickMultiple = numPrice / tick;
  return Math.abs(tickMultiple - Math.round(tickMultiple)) <= 1e-5;
}
