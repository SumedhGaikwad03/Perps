import type { toEngine } from "common";
import { executeMatchingFunction } from "./matching";

/**
 * Delegates order execution to the core matching engine.
 */
export async function executeOrder(
  command: Extract<toEngine, { messageType: "CREATE_ORDER" }>,
  loopbackId: string,
  streamEntryId: string,
) {
  return executeMatchingFunction(command, loopbackId, streamEntryId);
}

export { executeMatchingFunction } from "./matching";
