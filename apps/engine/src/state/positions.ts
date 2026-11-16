import type { Position } from "../types";

// Master map for all the positions that exist in the engine (key: userId:marketId)
const Positions: Map<string, Position> = new Map();

/**
 * Standard composite key generator for positions: `${userId}:${marketId}`.
 */
export function getPositionKey(userId: string, marketId: string): string {
  return `${userId}:${marketId}`;
}

/**
 * Retrieves a position by its composite key. Returns undefined if not found.
 */
export function getPosition(posKey: string): Position | undefined {
  return Positions.get(posKey);
}

/**
 * Retrieves a position by userId and marketId. Returns undefined if not found.
 */
export function getPositionByUserMarket(
  userId: string,
  marketId: string,
): Position | undefined {
  return Positions.get(getPositionKey(userId, marketId));
}

/**
 * Stores or updates a position in memory under the given composite key.
 */
export function setPosition(posKey: string, position: Position): void {
  Positions.set(posKey, position);
}

/**
 * Deletes a position from memory under the given composite key.
 */
export function deletePosition(posKey: string): boolean {
  return Positions.delete(posKey);
}

/**
 * Checks whether a position exists under the given composite key.
 */
export function hasPosition(posKey: string): boolean {
  return Positions.has(posKey);
}

/**
 * Returns the total count of active positions in memory.
 */
export function getPositionsCount(): number {
  return Positions.size;
}

/**
 * TEMPORARY COMPATIBILITY METHOD: Exposes mutable references through Map entries
 * to preserve Phase 1 compatibility. Will be replaced by immutable snapshots in future phases.
 */
export function getAllPositions(): IterableIterator<[string, Position]> {
  return Positions.entries();
}

/**
 * Clears all positions from memory (used for test teardown/resets).
 */
export function clearPositions(): void {
  Positions.clear();
}
