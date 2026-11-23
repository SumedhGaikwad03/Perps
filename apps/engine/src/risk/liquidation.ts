import { DefaultMrr, liquadation_intervals } from "../config";
import {
  getPositionsCount,
  getMarkPricesCount,
  getAllPositions,
  getOrderBook,
  getMarkPrice,
  deletePosition,
  getOrCreateBalance,
  setBalance,
} from "../state";
import { publisher } from "../streams/publisher";
import { calculateUnrealizedPnl } from "../positions/pnl";
import { calculateMaintenanceMargin, calculateEquity } from "./margin";

// this is the function that is used for liqautating the orders
// this is semi implented as the real issue lies in the adl and the fact that delevergaing the the opposite  side
// that makes the other side of the user hold actual margin against something actually vauleable
// we should never remove orders form the memory insted we should always submit an opposite order
// to sqare off the the postion
export async function sweepLiquadations() {
  if (getPositionsCount() === 0 || getMarkPricesCount() === 0) return;

  // this list will store all the liquadated postions
  const liquadatedList: any[] = [];

  for (const [posKey, pos] of getAllPositions()) {
    const marketId = pos.marketId;
    const entryPrice = parseFloat(pos.entryPrice);
    const initialMargin = parseFloat(pos.margin);
    const book = getOrderBook(pos.marketId);

    if (!book) continue;
    const rawPrice = getMarkPrice(book.baseToken);

    if (!rawPrice) continue;

    const markPrice = parseFloat(rawPrice);

    if (!markPrice || markPrice <= 0) {
      continue;
    }

    const qty = parseFloat(pos.qty);

    if (qty <= 0) {
      continue;
    }

    const unRealaisedPnl = calculateUnrealizedPnl(
      pos.side,
      entryPrice,
      markPrice,
      qty,
    );

    // this is a cusion for the user as this much amount can be backed by the user here
    // as this is the total amount the user can handel  
    const equity = calculateEquity(initialMargin, unRealaisedPnl);


    const maintainenceMargin = calculateMaintenanceMargin(
      qty,
      markPrice,
      DefaultMrr,
    );

    if (equity <= maintainenceMargin) {
      deletePosition(posKey);

      // delete the postion and the loss is taken up by the exchaange

      liquadatedList.push({
        posKey,
        userId: pos.userId,
        marketId: pos.marketId,
        equity: equity,
        mrr: maintainenceMargin,
        markPrice: rawPrice,
      });

      // time to refund the user if this balces if he has any left with him 

      const userBal = getOrCreateBalance(pos.userId); 

      const currentAvail = parseFloat(userBal.available_bal);
      const locked_bal = parseFloat(userBal.locked_bal); 

      const newLocked = Math.max(0, locked_bal - initialMargin);
      
      // as even when the margin is below zero the equity is still there with the user right 
      const refundAmount = Math.max(0, equity);

      const newAvail = refundAmount + currentAvail;

      setBalance(pos.userId, {
        available_bal: newAvail.toString(),
        locked_bal: newLocked.toString(),
      });

      await publisher.xAdd("db-events", "*", {
        eventType: "WALLET_UPDATE",
        payload: JSON.stringify({
          userId: pos.userId,
          amountAvail: newAvail.toString(),
          amountLocked: newLocked.toString(),
        }),
      });

      // we have make it real time so we have to backend or engine

      // time to clear all the orders form the book for this user

      // this clears the postion form the in memory array
      
      // we have to clear the order book for the user for any resting pos or fields that he may have

      // this below is the margin for the bids side that will take refunded to the user who just got liquadated 
      let cancelledOrderMagin = 0 ; 

      for (const [priceKey, level] of book.bids.entries()) {
        // we start to traverse the order book , find how may orders exists at that price level
        const intialOrderCount = level.orders.length;

        for(const o of level.orders){

          if(o.userId == pos.userId){

            let unfullfilledQty = parseFloat(o.qty) - parseFloat(o.filledQty);
            let initialMargin = parseFloat(o.lockedMargin); 
            cancelledOrderMagin += initialMargin * (unfullfilledQty/parseFloat(o.qty));


          }
        } 
       

        // find how may orders are not equal to the surrent user id , actually the orders are deleted here
        // that is the ordrs for the actual users are deleted here 


        level.orders = level.orders.filter((o) => o.userId !== pos.userId);

        if (level.orders.length !== intialOrderCount) {
          // loop executing here is proff that there are some orders that belong to the user here
          if (level.orders.length === 0) {
            // as if there are no orders apart form the user orders then its a waste of time
            // we delete that price level now 
            book.bids.delete(priceKey);
          } else {
            // update the unfullfilled qty at that order level here 
            level.totalQty = level.orders
              .reduce(
                (sum, o) => sum + (parseFloat(o.qty) - parseFloat(o.filledQty)),
                0,
              )
              .toString();
          }
        }

        // we have now cleared all the bids in the order book
      }
      // for  the time for asks now
      for (const [priceKey, level] of book.asks.entries()) {
        const intialOrderCount = level.orders.length;

        for(const o of level.orders){

          if(o.userId == pos.userId){

            let unfullfilledQty = parseFloat(o.qty) - parseFloat(o.filledQty);
            let initialMargin = parseFloat(o.lockedMargin); 
            cancelledOrderMagin += initialMargin * (unfullfilledQty/parseFloat(o.qty));


          }
        } 
        // clearing the order for the users that are not here
        level.orders = level.orders.filter((o) => o.userId !== pos.userId);

        if (level.orders.length !== intialOrderCount) {
          if (level.orders.length === 0) {
            book.asks.delete(priceKey);
          } else {
            level.totalQty = level.orders
              .reduce(
                (sum, o) => sum + (parseFloat(o.qty) - parseFloat(o.filledQty)),
                0,
              )
              .toString();
          }
        } 
      }


       setBalance(pos.userId ,{available_bal : (newAvail + cancelledOrderMagin).toString() ,
          locked_bal : (newLocked - cancelledOrderMagin).toString()
         }); 



      await publisher.xAdd("db-events" ,"*" ,{
        eventType : "WALLET_UPDATE",
        payload : JSON.stringify({
          userId : pos.userId ,
          amountAvail : (newAvail + cancelledOrderMagin).toString(),
          amountLocked : (newLocked - cancelledOrderMagin).toString(),

        }),
      });

      // this removes it form the db events
      await publisher.xAdd("db-events", "*", {
        eventType: "POSITION_LIQUIDATED",
        payload: JSON.stringify({
          status: "SUCESSS",
          userId: pos.userId,
          marketId: pos.marketId,
          equity: equity,
          mrr: maintainenceMargin,
          markPrice: getMarkPrice(book.baseToken),
        }),
      });
    }
  }
}

// used to start the liquadation poller
export function startLiquidationPoller() {
  setInterval(() => {
    sweepLiquadations().catch((err) => {
      console.log("There is a big error in liquadation  broo", err);
    });
  }, liquadation_intervals);
}
