import {createClient} from "redis"; 

import type {orderSide, toEngine} from "common" ; 
import { main } from "bun";


// we iniataire two instances that would read and publish the message for this stream 
const clientRead = createClient();
const publisher = createClient();
await Promise.all([
    clientRead.connect(),
    publisher.connect(),
]);

const STREAM_KEY = "engine";
const ENGINE_GROUP = "engine-consumer-group";
const CONSUMER_NAME= "engine-worker-1";


try {
    // we create am engine group if not already created 

    await clientRead.xGroupCreate(STREAM_KEY,ENGINE_GROUP,"0",{

        MKSTREAM : true,
    });
}
catch(error : any){ 

  if (!error?.message?.includes("BUSYGROUP")) { 
  }
}
 
// these are the types that we use through out the code base 
type OpenOrder = {
    userId : string ;
    originalOrderId : string;
    filledQty : string ;
    qty : string;
    leverage : string;
}
 type PriceLevel = {

    totalQty : string;
    orders : OpenOrder[];
 }

interface OrderBook {
    bids : Map<string , PriceLevel> ;
    asks : Map <string ,PriceLevel>;
    lastTradedPrice : number ;
    marketId : string ;
    symbol : string;
    tickSize : string,
    stepSize : string,
}

interface Position {
 userId : string , 
 marketId : string , 
 side : "LONG" | "SHORT",
 qty : string , 
 entryPrice : string , 
 margin : string ,
 leverage : string
} 




// we need to add the map for markprices, for the markets ,
//this is used for calauating the liquadations 

const markPrices = new Map< string , string>() ;
// this is a master register that keeps all the order books within itself 
const orderBook  = new Map<string , OrderBook>() ; 

// this is the master register for balances to keep all the balances for the users 
const Balances : Map<string, {available_bal:string , locked_bal:string}>  = new Map();

//this is the map for all the posostions that  exists in the engine 
const Positions :Map<string , Position> = new Map();

// the confindence margin that the engine uses to check for liquadations as this is 2.5% this
// helps to build the insureance fund of the engine 
const DefaultMrr = 0.025; 

console.log("engine has started");  



async function sweepLiquadations() {



    if(Positions.size === 0 || markPrices.size === 0) return ; 

  
    // this list will store all the liquadated postions 
    const liquadatedList : any[] = [] ; 

    for(const[posKey , pos] of Positions.entries()){ 
  
        const marketId = pos.marketId; 
        const entryPrice = parseFloat(pos.entryPrice);
        const intialMargin = parseFloat(pos.margin);
        const rawPrice  = markPrices.get(marketId);

        if(!rawPrice) continue; 
        
        const markPrice = parseFloat(rawPrice); 

        if(!markPrice || markPrice <= 0 ){
            continue; 
        }

        const qty = parseFloat(pos.qty);

        if(qty<=0){
            continue;
        }

 const unRealaisedPnl = pos.side == "LONG" ? (markPrice - entryPrice)*qty : (entryPrice - markPrice)*qty ;

 const equity = intialMargin + unRealaisedPnl ;

 const maintainenceMargin = qty*markPrice*DefaultMrr;

 if(equity<=maintainenceMargin){
    Positions.delete(posKey);

    liquadatedList.push({
    posKey ,
    userId : pos.userId,
    marketId : pos.marketId,
    equity  : equity,
     mrr   : maintainenceMargin,
     markPrice : markPrices.get(marketId)
 });


 await publisher.xAdd("db-events" ,"*", {
    eventType : "POSITION_LIQUIDATED",
    payload : JSON.stringify({
        status : "SUCESSS", 
       userId : pos.userId,
    marketId : pos.marketId,
    equity  : equity,
     mrr   : maintainenceMargin,
     markPrice : markPrices.get(marketId)

    }),


 });








    
 
 }

    
}}

async function fundingRate(){

    // iterata over all the insalised prices in the market 

if (orderBook.size == 0){
    return;
}

for(const [marketKey, orderbook] of orderBook){

    // now we have to ierate over the entrire market one by one 

    const perpPrice =orderbook.lastTradedPrice;

    const markPrice = parseFloat(markPrices.get(marketKey)!);

    let  premiumRate = markPrice> 0 
    ? (perpPrice - markPrice) / markPrice
    : 0;

    //now we have to find who pays who 

    premiumRate = Math.min(Math.max(premiumRate, -0.0005),0.0005);

    if(premiumRate === 0 ){
        continue; 
    }

    const settlements :any[] = [];
   // now as we have the preminum rate we now have to iterate 
    for(const [postionKey , pos ] of Positions){

       if(pos.marketId != marketKey){

        continue; 
       }

       const qty = parseFloat(pos.qty);

       if(qty<=0){
        continue; 
       }

       const notinalValue = qty * markPrice;
       const paymentValue =notinalValue*Math.abs(premiumRate);
       
       // this line of code determines is the curret user is payable 
       const isPayer = premiumRate > 0 ? pos.side === "LONG" : pos.side === "SHORT";

       const userBal = Balances.get(pos.userId);

       if(!userBal){
        continue; 
       }

       let currentAvail = parseFloat(userBal.available_bal);

       if(!isPayer){
    // if the current user is not the payer then we add the payment value to the player 
        currentAvail += paymentValue;
       }
       else{

        if(currentAvail > paymentValue){

            currentAvail-=paymentValue;
        }
        // the payee does not have enough to pay the other peer 
          else(currentAvail < paymentValue){

        const shortfall = paymentValue - currentAvail ;

        // to recover this shortfall form the paymets margin we have to do this 

        // exhaust his current available 
        currentAvail = 0 ; 

        const currentMargin = parseFloat(pos.margin);

        if(currentMargin > shortfall){

            pos.margin = (currentMargin - shortfall).toString();
            // we updated the position here 
            Positions.set(postionKey,pos); 
        

        }else {

            // if even the marigin is not enough then its bad debt wee have to cover it form our side 

            const badDebt = shortfall - currentMargin ;

            pos.margin="0";

            // we have to delete the postion 

            Positions.delete(postionKey);
            
            
            await publisher.xAdd("db-events", "*", {

                eventType : "POSITION_BANKRUPT",
                payload : JSON.stringify({

                    userId : pos.userId,
                    marketId : pos.marketId,
                    side : pos.side,
                    qty : pos.qty,
                    badDebt : badDebt,
                    reason : "FUNDING_INSOLVANCY",
                }),
            });

            console.warn(`[FUNDING_INSOLVANCY] has happend for this ${pos.userId} in the market ${pos.marketId} for ${badDebt}`);

        }

          }
       }

       Balances.set(pos.userId, {
        available_bal : currentAvail.toString(),
        locked_bal : userBal.locked_bal

       });




    }








}


}

const liquadation_intervals = 1000;

function startLiquidationPoller(){

    setInterval(()=> {

        sweepLiquadations().catch((err) => {

            console.log("There is a big error in liquadation  broo" , err)
        });
    }, liquadation_intervals);

}

const fundingRate_poller = 60*60*1000;

function startFundingRatePoller(){
    setInterval(() => {

        fundingRate().catch((err)=> {

            console.log("funding rate poller erroe",err);
     } )
        }, fundingRate_poller);
    
}
startFundingRatePoller();


while(true){

    
 // this is the sniipet to start the liquadation poller 
    startLiquidationPoller(); 


    try {

    const response = await clientRead.xReadGroup(
    ENGINE_GROUP, // this is the consumer group name  
    CONSUMER_NAME // this is the stream/worker we use to read data from 
    //message is tagged in the ple with the consumer_name   
     , [{

        key :"engine" , // the redis stream key to consume  from 
        id : ">" // this tell us that give only msg that are recent 
    }], {
        BLOCK:0, // waits unitl a new query drops 
        COUNT :1 // reads one query at a time 
    }
);

if(!response || !response[0]?.messages[0]){

    console.log("nothing found in the queue broo  bad luck ig ");
    continue; 
} 


// this is the entrie redis message that is received by the consermerworkr  
const  entry = response[0]?.messages[0];

if(!entry) continue ; 

console.log("engine req is reaching here ")

// THE entry message is currently is an strinfied version of the message 
// we have to destructure it and extract the loopback id of the message 
const loopbackId = entry.message.loopbackId; 

// this has the data that we are supposed to work on 
// this is basically an type check for the message we are working with 
const command : toEngine = JSON.parse(entry.message.payload!);  




//const message : {loopbackId : string } & toEngine = entry.message;

console.dir(response, { depth: null });

if(command.messageType == "CREATE_ORDER"){
    // destructuring the requied payload here 
   const{userId , orderId , marketId , qty , price , orderType , side , leverage} = command; 


   const book = orderBook.get(marketId); 
   // we extact order book from the market   


   if(!book){

    await publisher.xAdd("to-backend" , "*", { 

        loopbackId,
        status : "REJECTED",
        data : "",
        error : "MARKET_NOT_FOUND_BRO"

    });
   
  // to avoid reprocessing or publishing this entry here 
   await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
   continue;
}

// we here extract the user balnce and all other things that are required to destructured 
const userBalance = Balances.get(userId) ?? {available_bal : "0" , locked_bal : "0"};
const numQty = parseFloat(qty);
// here we infer what type of price does the user wants as its a limit price or market price 
const numPrice = price ? parseFloat(price) : book.lastTradedPrice; 


// checks if the user has given a vaild price and quantity 
if(numQty<=0 || (orderType === "LIMIT" && (!price || numPrice <= 0))){

    await publisher.xAdd("to-backend", "*" ,{
   loopbackId , 
   status : "REJECTED",
   data : "",
   error: "INVAILD_PRICE_OR_QTY"
    }); 

    await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
    continue; 
}


const userLeverage = command.leverage ? parseFloat(leverage) : 1 ;  

// check if the user needs extra margin to open an trade as is he squaring down on the current postion or opening a new posistion 

const reqMargin = command.reduceOnly ? 0 : ((numQty * numPrice)/userLeverage);

const currentAvailBalance = parseFloat(userBalance.available_bal) ; 


if(currentAvailBalance < reqMargin){

    await publisher.xAdd("to-backend" , "*", {

        loopbackId , 
        status : "REJECTED" ,
        data : "" ,
        error : "INVAILD_AVAILABLE_BAL_BROO"
    }); 
    // this file ack the fact that the engine has admited that this request is acknowldge 
    await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
    continue ; }

    Balances.set(userId , {

        available_bal : ( currentAvailBalance - reqMargin).toString(),
        locked_bal : (parseFloat(userBalance.locked_bal)+reqMargin).toString(),

    });

    // now the balacnece has been locked for the user , we now have to make the matching engine / work the matching engine 
    
    // this is the quantity that is still left to be filled 
    let  remaningQty = numQty ;  

    const fills : Array<{
    
    price : string ,
    
    qty :string , 
    //maker is the one who we swap with as he is the one that makes the fills possible 
    makerOrderId : string 
    
    makerUserId : string }> = [];

    // we extract the type of order and then also find the matching sode that we would swap our order with 
    const isBid = side === "BID";  

    const opposingBook = isBid ? book.asks : book.bids ; 


    const sortedPrices = Array.from(opposingBook.keys()).sort((a,b) => {

        // if our bid is true we sort the prices in ascending as ask are sorted ascending and bids are sorts decending 

        return isBid ? parseFloat(a)-parseFloat(b) : parseFloat(b)-parseFloat(a) 
    }); 

    for(const priceKey of sortedPrices) {

        // THIS LOOP WILL KEEP ON FILLING ORDER UNITL THE REMANING QTY IS ZERO OR THREE ARE NO SUTABLE ORDERS TO SWAP AGAINST 

        if(remaningQty <=0){
            break;
        } 

     const levelPrice = parseFloat(priceKey) ; // WE HAVE THE CURRENT BEST PRICE 



     if(orderType === "LIMIT"){

        // at limit orders the best price for each table is defined as 
        if(isBid && levelPrice >  numPrice) break;  // ask price is greater than num price that is given to the system by user 
        if(!isBid && levelPrice < numPrice)break ; // bid price is greater 
     }

     // is all is set for limit or simply the order is for market then 

     const priceLevel = opposingBook.get(priceKey); //pull the the entrie order for this price key 

     // time to fill the order one at a time like this 

     while(priceLevel?.orders.length!> 0 && remaningQty > 0) {

        // have to walk the order book to satifiy the orders we have injested  

        // we extract the first order form the book 

        const restingOrder = priceLevel?.orders[0] ; 

        const restingOrderRemaning = parseFloat(restingOrder?.qty!) - parseFloat(restingOrder?.filledQty!);


        // as we extract how much of the quantoty could be matched here 
        const matchQty = Math.min(remaningQty , restingOrderRemaning); 

        fills.push({

            price : priceKey , 
            qty : matchQty.toString(),
            makerOrderId : restingOrder?.originalOrderId!,
            makerUserId :  restingOrder?.userId!
            
         }); 

         // this is the updation in the restig order 

         restingOrder!.filledQty =(parseFloat(restingOrder!.filledQty)+matchQty).toString();  

         remaningQty -=  matchQty; // this is the updation in the user remaing qty  

         // now the reduce  the volume at the sitting order here 

         priceLevel!.totalQty = (parseFloat(priceLevel?.totalQty!)-matchQty).toString();


         // if the entire order is filled then we have to dequee that order 

         if(parseFloat(restingOrder!.filledQty) >= parseFloat(restingOrder!.qty)){ 

            priceLevel?.orders.shift();
            } 

     // if all the oders at the order book are eaten then we delete that price level 
        if(priceLevel?.orders.length== 0 ){

            opposingBook.delete(priceKey); 
        } 
    }
        
        // update the last traded price with the most reeint fills in the table 

        if(fills.length> 0 ){

            book.lastTradedPrice = parseFloat(fills[fills.length-1]!.price);
        }



         }

         // this is now the post matching logic , the order that could be swapped is swaped alrady we can move ahead from here so this cycle is over 

         let finalStatus :  "FILLED" | "PARTIALLY_FILLED" | 'OPEN' = "FILLED" ; 

         const exuctedQty = numQty - remaningQty ; // this is the amount that is still left to be executed 

         if(remaningQty > 0 ){
             
            //in case of a limit order we debralrt did not match the order as we dont have the required price but orders still exist 
            if(orderType === "LIMIT" ){

                finalStatus = exuctedQty > 0 ? "PARTIALLY_FILLED" : "OPEN"

                 // all the unfinished limit order must sit on the same side of the order book for all
             const targetSide = isBid? book.bids : book.asks ; 
              
             // this is the price that the order was places upon 
            const restingPrice = price!; 

            // get all the orders at the that level & we add volume to that level 
            let  level = targetSide.get(restingPrice); 

            if(!level){
            // if current price level does not exist then we create our own price 
                level ={
                totalQty : "0",
                orders : [],
            };

                targetSide.set(restingPrice, level);

            }

            
            //pushing our order to the level that was needed 
            level.orders.push({
            userId , 
            originalOrderId : orderId ,
            qty : numQty.toString(),
            filledQty : exuctedQty.toString(),
            leverage : userLeverage.toString(),

            }); 

            //updating the depth of the order for that level 
            level.totalQty = (parseFloat(level.totalQty)+remaningQty).toString()


          }else if (orderType === "MARKET"){

            finalStatus  = exuctedQty  > 0 ? "PARTIALLY_FILLED" : "OPEN"   

            // calculate collateral locked for unfullfiled portain  

            const unusedMargin = command.reduceOnly ? 0 : (remaningQty * numPrice)/userLeverage; 


            if(unusedMargin > 0 ){

                const latestBalance = Balances.get(userId); 

                Balances.set(userId , {
                    available_bal : (parseFloat(latestBalance!.available_bal)+unusedMargin).toString() , 
                    locked_bal : (parseFloat(latestBalance!.locked_bal) - unusedMargin).toString()

                });

                    
                } 
            }


          } 

          // if the the fills happens at a better price than the price specifoed then 

          if(fills.length>0 && !command.reduceOnly){

            const totalActualSpend = fills.reduce(

                (sum,f) => sum +  (parseFloat(f.qty)* parseFloat(f.price))/userLeverage , 0)
            
          

          const expectedSpent = (exuctedQty * numPrice)/userLeverage ; 

          const priceImprovementRefund = expectedSpent - totalActualSpend ; 

          if(priceImprovementRefund > 0 ){

            const latestBalance = Balances.get(userId); 

            Balances.set(userId , {

                available_bal : (parseFloat(latestBalance!.available_bal)+priceImprovementRefund).toString(),
                locked_bal : (parseFloat(latestBalance!.locked_bal) - priceImprovementRefund).toString()
            });
          }
        }
        // the full order is now completed its order 

        await publisher.xAdd("to-backend" , "*", {

            loopbackId , 
            status : "SUCCESS" ,
            data : JSON.stringify({
              orderId , 
              marketId , 
              status : finalStatus ,
              exuctedQty : exuctedQty.toString(),
              remaningQty : remaningQty.toString(),
              fills 
            }) ,

            error :" "

        });

        // now  for db persistance what we can do is 

        if(fills.length > 0 ){

            // we would add a seprate worker to make the db calls possible 
            await publisher.xAdd("db-events" , "*" , {
              eventType : "TRADE-EXECUTED",
              payload : JSON.stringify({
                takerOrderId : orderId ,
                takerUserId :  userId , 
                marketId , 
                fills 
              })
            });
        }
        // now the create order endpoint is finally done bro 
        // its done BRO ;)

       await clientRead.xAck(STREAM_KEY, ENGINE_GROUP, entry.id);
        continue; 
}

if(command.messageType == "CREATE_MARKET"){ 
   
    // to calauate the markprice the mark prices should only be created on top of existince market places 
    // then the mark price calaultion becomes easy and secure 
     // we are extracting the market here 
    const {symbol ,tickSize , stepSize  , marketId} = command ;  

    // we have to check if the duplicate market even exist 

    if(orderBook.has(marketId)){

        await publisher.xAdd("to-backend" , "*", {

            loopbackId , 
            status : "REJECTED",
            data : "",
            error : "MARKET_ALREADY_EXISTS"
        });

        // we ack the req as this req has been processed 
        await clientRead.xAck(STREAM_KEY, ENGINE_GROUP,entry.id);

        continue;
    }

    // now we have vaildated  that the engine exists then we move ahead and create an orderbook 

    const newBook : OrderBook  = {

        marketId, 
        symbol,
        lastTradedPrice : 0,
        tickSize ,
        stepSize,
        bids : new Map <string , PriceLevel >(),
        asks : new Map <string , PriceLevel>(),
};

orderBook.set(marketId,newBook); 

console.log("orderBook has been created for the market ");
// the orderbook has been created for the  

await publisher.xAdd("to-backend", "*", {
    loopbackId ,
    status : "SUCCESS",
    data : JSON.stringify({
     marketId,
     symbol,
     tickSize,
     stepSize,
     status : "INTIATILISED"
    }),
     error : "",
}); 

await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
continue;


}

if(command.messageType == "ON_RAMP"){

    
    // extarct the info from the command 

    const {userId , amount} = command ; 

    // we have to de-stringyfy the amount that was injested in the engine 
    const numAmount = parseFloat(amount); 

    // now we have to move ahead the as we nw have to amount 

    if(numAmount <=0 || isNaN(numAmount) ){
    
        console.log("The amount is too low ");

        await publisher.xAdd("to-backend", "*", {

            loopbackId , 
            status : "REJECTED",
            data : "",
            error : "AMOUNT_IS_TOO_LOW"
        });
    
   // every rejected or passed requets must be ack by the engine 
await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
continue; }


const currentBalances = Balances.get(userId) ?? {

    available_bal : "0",
    locked_bal : "0",
};

const newBalance = (parseFloat(currentBalances.available_bal) +numAmount).toString();

Balances.set(userId , {
    available_bal: newBalance , 
    locked_bal: currentBalances.locked_bal
});

console.log(`Engine has onrampeed the balances for this userid : ${userId} by  this amount ${numAmount}`);

await publisher.xAdd("to-backend", "*", {

    loopbackId : loopbackId ,
    status : "SUCCESS", 
    data : JSON.stringify( {
      userId ,
      available_bal : newBalance,
      locked_bal : currentBalances.locked_bal
  }) ,
  error : ""


});

await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
continue;
} 

if(command.messageType == "CANCEL_ORDER"){
 
    // destructing the incoming request 
    const{userId, marketId , orderId } = command ; 

    // we have to locate the order in the order book 

    const book = orderBook.get(marketId); 

    if(!book){

        await publisher.xAdd("to-backend", "*", {
            loopbackId , 
            status : "REJECTED", 
            data : "",
            error : "MARKET_DOES_NOT_EXISTS_BRO"
        }); 
        await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id); 
        continue; 
    }

    let foundOrder : OpenOrder | null = null ;

    let orderPrice : string  | null = null ;

    // the level here basically signifies that lits a sting and array of orders for that price 
    for(const [priceKey , level ] of book.bids.entries()){


// the below map and checks each order if the the order id is matching with the origonal order id or the user id in the system 
        const idx = level.orders.findIndex(

            (o)=> o.originalOrderId === orderId && o.userId ===userId 
        );

        // if we find the order in the array of orders that is idx is not -1

        if(idx !== -1){ 
          
            foundOrder = level.orders.splice(idx , 1)[0]!; 
            orderPrice = priceKey ; 
        
        // we have now extarcted the order and amount of the order  

      // we have to reduce the voume at the current level 
        const unExexcutedQty = parseFloat(foundOrder.qty)-parseFloat(foundOrder.filledQty);

        level.totalQty = (parseFloat(level.totalQty)-unExexcutedQty).toString();

        if(level.orders.length == 0){
            book.bids.delete(priceKey);
        }
        break;
    }
}
// now we search asks if we have not found the order in bids 

if(!foundOrder){

    for(const [priceKey , level ] of book.asks.entries()){


// the below map and checks each order if the the order id is matching with the origonal order id or the user id in the system 
        const idx = level.orders.findIndex(

            (o)=> o.originalOrderId === orderId && o.userId ===userId 
        );

        // if we find the order in the array of orders that is idx is not -1

        if(idx !== -1){ 
          
            foundOrder = level.orders.splice(idx , 1)[0]!; 
            orderPrice = priceKey ; 
        
        // we have now extarcted the order and amount of the order  

      // we have to reduce the voume at the current level 
        const unExexcutedQty = parseFloat(foundOrder.qty)-parseFloat(foundOrder.filledQty);

        level.totalQty = (parseFloat(level.totalQty)-unExexcutedQty).toString();

        if(level.orders.length == 0){
            book.asks.delete(priceKey);
        }
        break;
    }
}


}

if(!foundOrder || !orderPrice){

    await publisher.xAdd("to-backend", "*", {

        loopbackId , 
        status : "REJECTED",
        data : "",
        error : "THE_ORDER_WAS_NOT_FOUND_OR_FILLED"
    });

    await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
    continue;
}

// lets now rerealse the margin to release 

const unfilledQty = parseFloat(foundOrder.qty)-parseFloat(foundOrder.filledQty);
const leverge =  foundOrder.leverage ? parseFloat(foundOrder.leverage):1;
const marginToUnlock = (unfilledQty * parseFloat(orderPrice))/leverge; 

const Balance = Balances.get(userId);

if(Balance){
    const currentAvailBal = parseFloat(Balance.available_bal);
    const currentLockedBal = parseFloat(Balance.locked_bal);

    Balances.set(userId , {
        available_bal : (currentAvailBal+marginToUnlock).toString(),
        locked_bal : Math.max(0,currentLockedBal - marginToUnlock).toString(),
    });
}

// all is now set what is left is to notify the backend what is hapning 

await publisher.xAdd("to-backend", "*", {
    loopbackId ,
    status : "SUCCESS",
    data : JSON.stringify({
        orderId,
        marketId,
        status : "CANCELLED",
        unfilledQty: unfilledQty.toString(),

    }),
    error : ""
});

await publisher.xAdd("db-events", "*", {

    eventType : "ORDER_CANCELLED",
    payload : JSON.stringify({
        orderId,
        userId,
        marketId,
        status : "CANCELLED"
    }),
});

await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
continue;
}

if(command.messageType == "CHECK_LIQUIDATIONS"){ 

    // lets start to check the the market id for this route as 
    
    
    const {marketId , markPrice} = command ;  

    const numMarkPrice = parseFloat(markPrice); 

    // the positions that are suppose to be liquadted 
    const liquadatedList : any[] = []; 

    //now we iterate over the postions array here 
    for (const [posKey , pos ] of Positions.entries()){ 

 
        // check for the market that does the market even exist 
        if(pos.marketId != marketId) {
            continue ;
        }

        const qty = parseFloat(pos.qty) 

        if(qty<=0){
            continue; 
        }

        const entryPrice = parseFloat(pos.entryPrice);

        const intialMargin = parseFloat(pos.margin);  


     const unRealaisedPnl = pos.side == "LONG" ? (numMarkPrice - entryPrice)*qty : (entryPrice - numMarkPrice)*qty ; 
     
     const currentEquity = intialMargin + unRealaisedPnl ; 

     const maintainenceMargin = qty * numMarkPrice * DefaultMrr ; 


     if(currentEquity <= maintainenceMargin){
         
        // we have deleted the positon form the postion 
        Positions.delete(posKey);

        liquadatedList.push({
         posKey,
         userId : pos.userId ,
         marketId : pos.marketId,
         qty: pos.qty,
         markPrice : markPrice,
        })

     }
   // now we have to aintain a queue for db writes here  

   await publisher.xAdd("db-events", "*", {
    eventType : "POSITION_LIQUIDATED",
    payload : JSON.stringify({
        userId : pos.userId,
        marketId : pos.marketId,
        qty : pos.qty,
        markPrice: markPrice,
        loss : (intialMargin - currentEquity)
        }),
   }); 

   // now we have to make the backend poller as this was the request that the backend sent to here 

   await publisher.xAdd("to-backend" , "*", {
   
    loopbackId , 
    data : JSON.stringify({
        marketId,
        count : liquadatedList.length,
        liquadatedList : liquadatedList,
    }),
    error : ""
   });

}

await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
continue; 
// this is now done for this endpoint here 
}
  
 }catch(err){

         console.error("[Engine Consumer Error]:" , err);
    }
}