import {
  getPosition,
  setPosition,
  deletePosition,
  getOrCreateBalance,
  setBalance,
} from "../state";
import { publisher } from "../streams/publisher";
import { calculateRealizedPnl } from "./pnl";

// this function is used for update the position for the order
export async function updatePositionFills(
  userId: string,
  marketId: string,
  baseToken: string,
  side: "LONG" | "SHORT",
  fillQty: string,
  fillPrice: string,
  leverage: string,
) {
  // here we find the user and the market id for positions in that market here
  const posKey = `${userId}:${marketId}`;

  const existingPosition = getPosition(posKey);

  let incomingQty = parseFloat(fillQty);
  let incomingPrice = parseFloat(fillPrice);
  let incomingLeverage = parseFloat(leverage);

  if (
    incomingQty <= 0 ||
    !Number.isFinite(incomingQty) ||
    !Number.isFinite(incomingPrice) ||
    !Number.isFinite(incomingLeverage) ||
    incomingLeverage <= 0
  ) {
    throw new Error("QTY_IS_INAVILD_BRO");
  }

  // if that user does not have an position open in that market then

  // this is a brand new posotion that we have opened for the user
  if (!existingPosition || parseFloat(existingPosition.qty) === 0) {
    const margin = (
      (incomingQty * incomingPrice) /
      incomingLeverage
    ).toString();

    setPosition(posKey, {
      userId,
      marketId,
      baseToken,
      side,
      qty: fillQty,
      entryPrice: fillPrice,
      margin: margin,
      leverage: leverage,
    });

    return;
  }

  // the postion in that exists in the market is  then we can do this as
  const existingQty = parseFloat(existingPosition.qty);
  const existingPrice = parseFloat(existingPosition.entryPrice);
  const existingMargin = parseFloat(existingPosition.margin);

  // now we either add into the postion or dleverage the postion

  if (existingPosition.side === side) {
    // we double down on the existing postion as we make this we incerse the stakes in the project
    const newQty = existingQty + incomingQty;
    const avgEntryPrice =
      (existingQty * existingPrice + incomingQty * incomingPrice) / newQty;
    const addedMargin = (incomingQty * incomingPrice) / incomingLeverage;
    const totalNewMargin = existingMargin + addedMargin;
    const totalNotianoalValue = newQty * avgEntryPrice;

    const blendedLeverage = totalNotianoalValue / totalNewMargin;

    // now its time to set new postions here as

    setPosition(posKey, {
      ...existingPosition,
      qty: newQty.toString(),
      entryPrice: avgEntryPrice.toString(),
      margin: (existingMargin + addedMargin).toString(),
      leverage: blendedLeverage.toFixed(2).toString(),
    });
    return;
  }

  // now the flat pipeline for handing the opposing side of orders

  const closedQty = Math.min(existingQty, incomingQty);

  const marginReduction = (closedQty / existingQty) * existingMargin;

  const realisedPnl = calculateRealizedPnl(
    existingPosition.side,
    existingPrice,
    incomingPrice,
    closedQty,
  );

  const userBal = getOrCreateBalance(userId);

  const newBalance = Math.max(
    0,
    parseFloat(userBal.available_bal) + marginReduction + realisedPnl,
  );

  setBalance(userId, {
    available_bal: newBalance.toString(),
    locked_bal: userBal.locked_bal,
  });

  await publisher.xAdd("db-events", "*", {
    eventType: "WALLET_UPDATE",
    payload: JSON.stringify({
      userId,
      amountAvail: newBalance.toString(),
      amountLocked: userBal.locked_bal.toString(),
    }),
  });

  // now time for sate mutation here as for postions as
  if (incomingQty >= existingQty) {
    deletePosition(posKey); // delete the current position

    const leftOverQty = incomingQty - existingQty;

    if (leftOverQty > 0) {
      const leftOverMargin = (leftOverQty * incomingPrice) / incomingLeverage;

      setPosition(posKey, {
        userId,
        marketId,
        baseToken,
        side,
        qty: leftOverQty.toString(),
        margin: leftOverMargin.toString(),
        leverage,
        entryPrice: fillPrice,
      });
    }
  } else {
    // if the side is opposing but there are partial fills then what we can do is

    const remainingQty = existingQty - incomingQty;

    const remaingMargin = Math.max(0, existingMargin - marginReduction);

    const remainigNotionalValue = remainingQty * existingPrice;

    const currentLeverage =
      remaingMargin > 0 ? remainigNotionalValue / remaingMargin : 0;

    setPosition(posKey, {
      ...existingPosition,
      qty: remainingQty.toString(),
      margin: remaingMargin.toString(),
      leverage: currentLeverage.toString(),
    });
  }

  /* ==========================================================================
     DEAD CODE FOR REVIEW - OPPOSING SIDE POSITION UPDATE (PREVIOUS LOGIC)
     ==========================================================================
  // // now to handel the opposing side as
  // // as this is the term when side is not equal and the fills are higher than the required
  // // amount
  // if (parseFloat(fillQty) >= existingQty) {
  //   // this is the term in which we close the postion for the user which was for the current side

  //   // this is the excess qty that we have to open and oppsoing postion for
  //   filledQty = (existingQty - parseFloat(fillQty)).toString();
  //   Positions.delete(posKey);

  // } else {
  //   // if he is just squaring off the postion he himself made then he can absorb the sell right now
  //   const remaingQty = existingQty - parseFloat(fillQty);

  //   // calauate the new margin that this margin we have to adjust the new margin
  //   const closedQty = Math.min(existingQty, parseFloat(fillQty));
  //   // this is the amount of margin we have to reduce this much margin in the maker balance
  //   const marginReduction = (closedQty / existingQty) * existingMargin;

  //   // to check the realised pnl in the system what we can do is
  //   const realisedPnl =
  //     existingPosition.side === "LONG"
  //       ? (parseFloat(fillPrice) - existingPrice) * closedQty
  //       : (existingPrice - parseFloat(fillPrice)) * closedQty;

  //   // now time to update the users balances

  //   const userBal = Balances.get(existingPosition.userId) ?? {
  //     available_bal: "0",
  //     locked_bal: "0",
  //   };

  //   const currAvailBalance = parseFloat(userBal.available_bal);

  //   const newAvailBalance = Math.max(
  //     0,
  //     currAvailBalance + marginReduction + realisedPnl,
  //   );

  //   // time yo update the balance for the user

  //   Balances.set(existingPosition.userId, {
  //     available_bal: newAvailBalance.toString(),
  //     locked_bal: userBal.locked_bal,
  //   });

  //   // we have to mutate those positions as we move ahead as what we can do is

  //   if (parseFloat(fillQty) >= existingQty) {
  //     // then this postion is closed bro
  //     Positions.delete(posKey);

  //     // now we have to flip this position for that trader as follows

  //     const leftOverQty = parseFloat(fillQty) - existingQty;

  //     if (leftOverQty > 0) {
  //       const leftOverMargin =
  //         (leftOverQty * parseFloat(fillPrice)) / parseFloat(leverage);

  //       Positions.set(posKey, {
  //         userId,
  //         marketId,
  //         baseToken,
  //         side,
  //         qty: fillQty,
  //         entryPrice: fillPrice,
  //         margin: leftOverMargin.toString(),
  //         leverage: leverage,
  //       });
  //     }
  //   } else {
  //     // this block does when we have partial filled orders

  //     const remaningQty = existingQty - parseFloat(fillQty);
  //     const remaingMargin = Math.max(0, existingMargin - marginReduction);

  //     Positions.set(posKey, {
  //       ...existingPosition,
  //       qty: remaningQty.toString(),
  //       margin: remaingMargin.toString(),
  //     });
  //   }
  // }
     ========================================================================== */
}
