import {prisma} from "db";
import {
  setOrderBook,
  addMarketToBaseToken,
  getOrderBook,
  mirrorOrderBookDepth,
  MirrorOpenOrder,
} from "../state/orderbooks";
import { setBalance } from "../state/balances";
import { setPosition, getPositionKey } from "../state/positions";
import type { OrderBook, Position, PriceLevel } from "../types";
import type { OrderAcceptedPayload } from "common";

export async function bootstrapEngine(): Promise<void> {
  console.log("[Engine Bootstrap] Starting state hydration from PostgreSQL...");


// this file is basiicly there for the when the engine fails and then we have bring back the engine to
// a safer state now 

const markets = await prisma.market.findMany();

// we have added the base token to the market 
for(const m of markets){

    addMarketToBaseToken(m.baseToken,m.id);

    // time to fetch the last executed trade price if it exists
    const lastFill = await prisma.fill.findFirst({
      where: { marketId: m.id },
      orderBy: { createdAt: "desc" },
      select: { price: true },
    });

    const intialBook : OrderBook = {
      bids : new Map<string,PriceLevel>(),
      asks : new Map<string,PriceLevel>(),
      lastTradedPrice : lastFill ? parseFloat(lastFill.price) : 0,
      marketId : m.id,
      baseToken : m.baseToken,
      symbol : m.symbol,
      stepSize : m.stepSize,
      tickSize : m.tickSize,
    };

    setOrderBook(m.id,intialBook);



}
console.log(`Engine is now bootstrapped now ${markets.length} market`);


// time to hydrate the balances now 

const wallets = await prisma.wallet.findMany();

for(const w of wallets){

    setBalance(w.userId,{
     available_bal: w.amountAvail,
     locked_bal : w.amountLocked,
    });
}
console.log(`Wallet has been hydrated as${wallets.length} have been hydrated `);

// time for active postions 

const postions = await prisma.position.findMany({

    where : {
        size : {not : "0" }
    },
    include : {
        market: true
    },
});

for( const p of postions ){
  const numSize = parseFloat(p.size);
  if(!numSize || numSize === 0 ) continue ;


  const side = numSize>0 ? "LONG" : "SHORT";
  const absQty = Math.abs(numSize).toString();
  const lev = p.leverage > 0 ? p.leverage : 1 ;
  const notional = Math.abs(numSize)*parseFloat(p.entryPrice);
  const margin = (notional/lev).toString();
  
  const positionObj : Position ={

    userId : p.userId,
    marketId : p.marketId,
    side ,
    qty : absQty,
    baseToken : p.market.baseToken,
    entryPrice :p.entryPrice,
    margin ,
    leverage : lev.toString(),

  };

  // we create an poskey for the user as 
  const poskey = getPositionKey(p.userId,p.marketId);

  setPosition(poskey,positionObj);

}
console.log(`Hydrated ${postions.length} positions in the market `);

// time to hydraee the resting orders 

const restingOrders = await prisma.order.findMany({

    where : {
        status : {in : ["OPEN","PARTIALLY_FILLED"]}
    },
    orderBy : {
        createdAt : "asc",
    }
});

for(const o of restingOrders){

    // the price does not exist then we move ahead 
    if(!o.price){
        continue;
    }

    const book = getOrderBook(o.marketId);
    if(!book){
        continue;
    }

    const targetSide = o.orderSide === "BID" ? book.bids : book.asks ;
    const priceKey = o.price; 

    let level = targetSide.get(priceKey);
    if(!level){
     level={   // we create  the level if it does not exist
        totalQty : "0",
        orders : []  ,
    };

    
    targetSide.set(priceKey,level);

}

const unexecutedQty = parseFloat(o.qty) - parseFloat(o.filledQty);

if(unexecutedQty <= 0 ) continue ;

const notional = parseFloat(o.qty) * parseFloat(o.price);
const calculatedLeverage = parseFloat(o.initialMargin) > 0 
  ? Math.round(notional / parseFloat(o.initialMargin)).toString() 
  : "1";

// this was just for one order here 
level.orders.push({
    userId : o.userId,
    originalOrderId : o.id,
    qty : o.qty,
    filledQty : o.filledQty,
    lockedMargin : o.lockedMargin,
    leverage : calculatedLeverage,
    reduceOnly : o.reduceOnly,
});

level.totalQty = (parseFloat(level.totalQty) + unexecutedQty).toString();

const payload :  OrderAcceptedPayload = {
      orderId: o.id,
      userId: o.userId,
      marketId: o.marketId,
      orderType: o.orderType,
      orderSide: o.orderSide,
      price: o.price,
      qty: o.qty,
      timeInForce: o.timeInForce,
      reduceOnly: o.reduceOnly,
      initialMargin: o.initialMargin,
      lockedMargin: o.lockedMargin,
};
MirrorOpenOrder(payload);
}

console.log(`engine has been rebuilt  ${restingOrders.length} restings orders`);

// time to dept flush to redis for the frontend to work upon 

for(const m of markets){

    mirrorOrderBookDepth(m.id);
}

console.log(`engine is also mirred to the backend now lets move ahead now`);

}
