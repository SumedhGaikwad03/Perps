import type { UserBalance } from "../types";
import { publisher } from "../streams/publisher";

// Master register for balances to keep all the balances for the users
const Balances: Map<string, UserBalance> = new Map();


// this is the new endpoint to make the balces mirror the actual balences as

export function mirrorBalancesToRedis(userId : string , balance : UserBalance){
 if(!publisher.isOpen){

  return ;
 }
 publisher.hSet(`user:${userId}:balances`, `data`, JSON.stringify(balance))
 .catch((error)=> {
   console.log("redis mirror failed to get the balances for this user ", userId , "becasue of this err", error);

 });

}
/**
 * Returns the user's balance if present in the state map, or undefined if the user has no balance record.
 * Does NOT instantiate a default record.
 */
export function getBalance(userId: string): UserBalance | undefined {
  return Balances.get(userId);
}

/**
 * Returns the user's balance if present; if absent, initializes and stores a zero balance
 * record `{ available_bal: "0", locked_bal: "0" }` in the Map and returns it.
 * Guarantees that callers receive a persistent reference in state, not a disconnected temporary object.
 */
export function getOrCreateBalance(userId: string): UserBalance {
  let bal = Balances.get(userId);
  if (!bal) {
    bal = {
      available_bal: "0",
      locked_bal: "0",
    };
    Balances.set(userId, bal);

     
   // creating an hash state to build up the in memory array in the engine 
  mirrorBalancesToRedis(userId, bal);
  }
  return bal;
}

/**
 * Sets or replaces a user's stored balance record using string-based financial values.
 */
export function setBalance(userId: string, balance: UserBalance): void {
  Balances.set(userId, {
    available_bal: balance.available_bal,
    locked_bal: balance.locked_bal,
  });
  const newBal = {available_bal : balance.available_bal , locked_bal : balance.locked_bal}

  mirrorBalancesToRedis(userId, newBal);
}

/**
 * Updates a user's balance using string-based financial amounts.
 */
export function updateBalance(
  userId: string,
  available_bal: string,
  locked_bal: string,
): void {
  const newBal = {
    available_bal,
    locked_bal,
  };
  Balances.set(userId, newBal);
  mirrorBalancesToRedis(userId, newBal);
}

/**
 * Checks whether a user exists in the balance map.
 */
export function hasBalance(userId: string): boolean {
  return Balances.has(userId);
}

/**
 * Removes a user's balance record from memory.
 */
export function deleteBalance(userId: string): boolean {
  return Balances.delete(userId);
}

/**
 * Returns total count of tracked balances in memory.
 */
export function getBalancesCount(): number {
  return Balances.size;
}

/**
 * TEMPORARY COMPATIBILITY METHOD: Exposes mutable references through Map entries
 * to preserve Phase 1 compatibility. Will be replaced by immutable snapshots in future phases.
 */
export function getAllBalances(): IterableIterator<[string, UserBalance]> {
  return Balances.entries();
}

/**
 * Clears all balances from memory (used for test teardown/resets).
 */
export function clearBalances(): void {
  Balances.clear();
}
