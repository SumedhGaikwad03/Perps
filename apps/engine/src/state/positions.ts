import { json } from "express";
import { publisher } from "../streams";
import type { Position } from "../types";

// Master map for all the positions that exist in the engine (key: userId:marketId)
const Positions: Map<string, Position> = new Map();



// this function below is used to mirror positions to redis 

export function mirrorPositionsToRedis( position : Position) {
  // add the full pos to the market 

  if(!publisher.isOpen){

    return ;
  }
  publisher.hSet(`user:${position.userId}positions` , position.marketId, JSON.stringify(position));
}

// this is the function to remove the mirror postions 


export function deleteMirroredPosition(posKey : string){
  // we only send poskey as an user can hold many postion as 
  // user123:btc , we can delte this just by this key 

  if(!publisher.isOpen){
    return;
  }
  const [userId , marketId] = posKey.split(":");

  if(!userId || !marketId){
    return 
  }

  publisher.hDel(`user:${userId}:position`,marketId)
  .catch((error)=> {
    console.log(`There was a error in the file broo for the user and clearng his pos${userId} and {} `)
  })
}
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
  mirrorPositionsToRedis(position);
}

/**
 * Deletes a position from memory under the given composite key.
 */
export function deletePosition(posKey: string): boolean {
  return Positions.delete(posKey);
  deleteMirroredPosition(posKey);
  
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
