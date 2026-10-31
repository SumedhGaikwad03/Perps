import {createClient} from "redis"; 

import type {toEngine} from "common" ; 


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

    await clientRead.xGroupCreate(STREAM_KEY,ENGINE_GROUP,"0",{

        MKSTREAM : true,
    });
}
catch(error : any){ 

  if (!error?.message?.includes("BUSYGROUP")) { // this signify that the group that the group is already been created 
    throw error;
  }
}
 // this part initilaises the queue if not already created 

type OpenOrder = {
    userId : string ;
    originalOrderId : string;
    filledQty : string ;
    qty : string;
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
}



const orderBook  = new Map<string , OrderBook>() ; 

const Balances : Map<string, {available_bal:string , locked_bal:string}>  = new Map();

console.log("engine has started"); 


while(true){

    try {

    const response = await clientRead.xReadGroup(
    ENGINE_GROUP, // this is the consumer group name  
    CONSUMER_NAME // this is the stream/worker we read from 
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

//this is the message that is the complete entry message published by redis 
const  entry = response[0]?.messages[0];

if(!entry) continue ; 

console.log("engine req is reaching here ")

// destructuring this way cuz we strified the redis response 
const loopBackId = entry.message.loopbackId; 
const command : toEngine = JSON.parse(entry.message.payload); //


//const message : {loopbackId : string } & toEngine = entry.message;

console.dir(response, { depth: null });

if(command.messageType == "CREATE_ORDER"){
    // destructuring the requied payload here 
   const{userId , orderId , marketId , qty , price , orderType , side , leverage} = command; 


   const book = orderBook.get(marketId);

   if(!book){

    await publisher.xAdd("to-backend" , "*", {

        loopBackId,
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


if(numQty<=0 || (orderType === "LIMIT" && (!price || numPrice <= 0))){

    await publisher.xAdd("to-backend", "*" ,{
   loopBackId , 
   status : "REJECTED",
   data : "",
   error: "INVAILD_PRICE_OR_QTY"
    } ); 

    await clientRead.xAck(STREAM_KEY,ENGINE_GROUP,entry.id);
    continue; 
}
const userLeverage = command.leverage ? parseFloat(leverage) : 1 ;  

const reqMargin = command.reduceOnly ? 0 : ((numQty * numPrice)/userLeverage);

const currentAvailBalance = parseFloat(userBalance.available_bal) ; 


if(currentAvailBalance < reqMargin){

    await publisher.xAdd("to-backend" , "*", {

        loopBackId , 
        status : "REJECTED" ,
        data : "" ,
        error : "INVAILD_AVAILABLE_BAL_BROO"
    }); 

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

        if(remaningQty <=0){
            break;
        } 

     const levelPrice = parseFloat(priceKey) ;



     if(orderType === "LIMIT"){

        // at limit orders the best price for each table is defined as 
        if(isBid && levelPrice >  numPrice) break;  // ask price is greater 
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


        const matchQty = Math.min(remaningQty , restingOrderRemaning); // as we extract how much of the quantoty could be matched here 

        fills.push({

            price : priceKey , 
            qty : matchQty.toString(),
            makerOrderId : restingOrder?.originalOrderId!,
            makerUserId :  restingOrder?.userId!
         }) ; 

         restingOrder!.filledQty =(parseFloat(restingOrder!.filledQty)+matchQty).toString(); // this is the updation in the restig order 

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
    














}







//     const existingbook = orderBook.get(
//         (book) => book.marketId === message.marketId
//     );

//     if(existingbook){
//         console.log("order book already exists with this id : " , existingbook.marketId)
//     }
//     else{

//      const createdbook = {

//         bids : new Map(),
//         asks : new Map(),
//         lastTradedPrice : -1 ,
//         marketId : message.marketId


//     }

//     orderBook.push(createdbook);

//     console.log("orderbook created as ");
// console.dir(createdbook , {depth : null });

//   }

//     await publisher.xAdd("to-backend", "*" , {

//     loopbackId: message.loopbackId ,
//     // this tell that this id has been processed 
//     result : JSON.stringify({success :true})
// });

  
// await clientRead.xAck(
//     "engine",
//     "engine",
//     entry.id
// );



// }
// if(message.messageType == "onRamp") {

//     const balance = Balances.get(message.userId) ?? {

//         available_bal: "0" ,
//         locked_bal : "0" 
//     }; // we retirivied the user balances 

//     Balances.set(message.userId , { ...balance , available_bal : String(Number(balance.available_bal) + Number(message.amount))});

//     // this need to update the user balance in the system 
//     // this upadates the balance in the ram 
// await publisher.xAdd("to-backend", "*" , {

//     loopbackId: message.loopbackId, // this tell that this id been processed 
//     result : JSON.stringify({success : true})
// })

// await clientRead.xAck(
//     "engine",
//     "engine",
//     entry.id
// ); // this removes the msg form the plending entries list but the logs still persist 

// }
// //  now to publish the msg to the the other queue we need to publish the meassage 

// if(message.messageType == "")





// }catch(err){

//         console.error("[Engine Consumer Error]:" , err);
//     }