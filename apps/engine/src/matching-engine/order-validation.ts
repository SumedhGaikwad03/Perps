import type { OrderBook, Position, UserBalance } from "../types";
import type { toEngine } from "common";

export * from "../utils/precision";

/**
 * Validation result for order parameter verification.
 */
export interface OrderValidationResult {
  isValid: boolean;
  error?: string;
}
