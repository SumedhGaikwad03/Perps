import Decimal from "decimal.js";

// Snaps a price to the nearest tickSize multiple, formatted to tickSize decimal precision.
export function snapToTick(price: string | number, tickSize: string | number): string {
  try {
    const dPrice = new Decimal(price);
    const dTick = new Decimal(tickSize);
    if (dTick.isZero()) return dPrice.toFixed();
    const precision = dTick.decimalPlaces();
    const steps = dPrice.dividedBy(dTick).round();
    const snapped = steps.times(dTick);
    return snapped.toFixed(precision);
  } catch {
    return String(price);
  }
}

// Snaps a quantity to the nearest stepSize multiple, formatted to stepSize decimal precision.
export function snapToStep(qty: string | number, stepSize: string | number): string {
  try {
    const dQty = new Decimal(qty);
    const dStep = new Decimal(stepSize);
    if (dStep.isZero()) return dQty.toFixed();
    const precision = dStep.decimalPlaces();
    const steps = dQty.dividedBy(dStep).round();
    const snapped = steps.times(dStep);
    return snapped.toFixed(precision);
  } catch {
    return String(qty);
  }
}

// Formats a quantity with exact decimal precision based on market stepSize,
// eliminating all IEEE 754 float precision artifacts.
export function formatQty(qty: string | number | undefined | null, stepSize?: string): string {
  if (qty === undefined || qty === null || qty === "") return "0";
  try {
    const d = new Decimal(qty);
    if (d.isNaN()) return "0";
    if (stepSize) {
      const precision = new Decimal(stepSize).decimalPlaces();
      return d.toFixed(precision);
    }
    // If no stepSize specified, round to 8 decimal places to eliminate floating point noise (e.g. 0.3999999999999999 -> 0.4)
    return new Decimal(d.toFixed(8)).toString();
  } catch {
    return String(qty);
  }
}

// Formats a price with exact decimal precision based on market tickSize.
export function formatPrice(price: string | number | undefined | null, tickSize?: string): string {
  if (price === undefined || price === null || price === "") return "0";
  try {
    const d = new Decimal(price);
    if (d.isNaN()) return "0";
    if (tickSize) {
      const precision = new Decimal(tickSize).decimalPlaces();
      return d.toFixed(precision);
    }
    return d.toFixed();
  } catch {
    return String(price);
  }
}

// Normalizes a number string by trimming and removing extraneous trailing zeros
// while maintaining exact decimal value.
export function normalizeDecimal(val: string | number): string {
  try {
    return new Decimal(val).toString();
  } catch {
    return String(val);
  }
}

