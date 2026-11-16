import { fundingRate_poller } from "../config";
import {
  getOrderBooksCount,
  getAllOrderBooks,
  getMarkPrice,
  getAllPositions,
  getBalance,
  setPosition,
  deletePosition,
  setBalance,
} from "../state";
import { publisher } from "../streams/publisher";

// this is the funtion is used for funding rate
// this is incomplete as the funds needs to transfered in the correct propostion in the system
// all the other cautions are happening roughtly here
export async function fundingRate() {
  // iterata over all the insalised prices in the market

  if (getOrderBooksCount() == 0) {
    return;
  }

  for (const [marketKey, orderbook] of getAllOrderBooks()) {
    // now we have to ierate over the entrire market one by one

    const perpPrice = orderbook.lastTradedPrice;

    const rawPrice = getMarkPrice(orderbook.baseToken);

    if (!rawPrice) continue;

    const markPrice = parseFloat(rawPrice);

    if (
      !Number.isFinite(perpPrice) ||
      perpPrice <= 0 ||
      !Number.isFinite(markPrice) ||
      markPrice <= 0
    ) {
      continue;
    }

    let premiumRate = markPrice > 0 ? (perpPrice - markPrice) / markPrice : 0;

    //now we have to find who pays who

    premiumRate = Math.min(Math.max(premiumRate, -0.0005), 0.0005);

    if (premiumRate === 0) {
      continue;
    }

    const settlements: any[] = [];
    // now as we have the preminum rate we now have to iterate
    for (const [postionKey, pos] of getAllPositions()) {
      if (pos.marketId != marketKey) {
        continue;
      }

      const qty = parseFloat(pos.qty);

      if (qty <= 0) {
        continue;
      }

      const notinalValue = qty * markPrice;
      const paymentValue = notinalValue * Math.abs(premiumRate);

      // this line of code determines is the curret user is payable
      const isPayer =
        premiumRate > 0 ? pos.side === "LONG" : pos.side === "SHORT";

      const userBal = getBalance(pos.userId);

      if (!userBal) {
        continue;
      }

      let currentAvail = parseFloat(userBal.available_bal);
      let currentLocked = parseFloat(userBal.locked_bal);

      if (!isPayer) {
        // if the current user is not the payer then we add the payment value to the player
        currentAvail += paymentValue;
      } else {
        if (currentAvail >= paymentValue) {
          currentAvail -= paymentValue;
        }
        // the payee does not have enough to pay the other peer
        else {
          const shortfall = paymentValue - currentAvail;

          // to recover this shortfall form the paymets margin we have to do this

          // exhaust his current available
          currentAvail = 0;

          const currentMargin = parseFloat(pos.margin);

          if (currentMargin > shortfall) {
            const newMargin = currentMargin - shortfall; 
            pos.margin = (newMargin).toString();
            // by reducing the margin we are actually increasing the users leverage and makeing the position more vulnerable to
            // the risk for liquation as  leverage = notional/margin
            // we updated the position here

            currentLocked = Math.max(0, currentLocked - shortfall);

            const newLeverage = (notinalValue / newMargin).toFixed(2);
            pos.leverage = newLeverage;
            setPosition(postionKey, pos);

            await publisher.xAdd("db-events", "*", {
              eventType: "POSITION_UPDATED",
              payload: JSON.stringify({
                userId: pos.userId,
                marketId: pos.marketId,
                size: pos.side === "LONG" ? pos.qty : `-${pos.qty}`,
                entryPrice: pos.entryPrice,
                leverage: Number(newLeverage),
                liquidationPrice: null,
              }),
            });
          } else {
            // if even the marigin is not enough then its bad debt wee have to cover it form our side

            const badDebt = shortfall - currentMargin;

            pos.margin = "0";

            currentLocked = Math.max(0, currentLocked - currentMargin);

            // we have to delete the postion

            deletePosition(postionKey);

            await publisher.xAdd("db-events", "*", {
              eventType: "POSITION_BANKRUPT",
              payload: JSON.stringify({
                userId: pos.userId,
                marketId: pos.marketId,
                side: pos.side,
                qty: pos.qty,
                badDebt: badDebt,
                reason: "FUNDING_INSOLVANCY",
              }),
            });

            console.warn(
              `[FUNDING_INSOLVANCY] has happend for this ${pos.userId} in the market ${pos.marketId} for ${badDebt}`,
            );
          }
        }
      }

      setBalance(pos.userId, {
        available_bal: currentAvail.toString(),
        locked_bal: currentLocked.toString(),
      });

      // time to persisit this data to the db
      await publisher.xAdd("db-events", "*", {
        eventType: "WALLET_UPDATE",
        payload: JSON.stringify({
          userId: pos.userId,
          amountAvail: currentAvail.toString(),
          amountLocked: currentLocked.toString(), 
        }),
      });
    }
  }
}

// thisi is used to start the funding rate poller
export function startFundingRatePoller() {
  setInterval(() => {
    fundingRate().catch((err) => {
      console.log("funding rate poller erroe", err);
    });
  }, fundingRate_poller);
}
