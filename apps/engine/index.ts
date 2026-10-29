import {createClient} from "redis"; 

import type {toEngine} from "common" ; 


const clientRead = createClient();
const publisher = createClient();
await Promise.all([
    clientRead.connect(),
    publisher.connect(),
]);

//const clientRead = createClient();

////clientRead.connect(); // redis client is created 

//const publisher = createClient();

//publisher.connect();

//client.xGroupCreate("engine"  , "engine" , "$" , { // we are creatig a consumer gropu here 

//     MKSTREAM :true // this is make the stream form the engine once this runs 
// }) // this was a one time thing 

// try{

//     await clientRead.xGroupCreate(
//         "engine","engine","0", {MKSTREAM : true});
    
// }catch(error){

//     if( 
//         !(error instanceof Error) || 
//         !error.message.includes("BUSYGROUP")
//     ){
//         throw error ; 
//     }
// }


type openOrder = {

    userId : string,
    originalOrderId : string,
    filledQty : string ,
    Qty : string
}
type Bid ={
    availableQty : number ,
    openOrders : []
}
type Ask ={

    availbleQty : number , 
    openOrder : []
}

interface orderBook {
    bids : Map<string , Bid> , 
    asks : Map <string ,Ask>,
    lastTradedPrice : number ,
    marketId : string 
}

const orderBook  : orderBook[] =  [] ; 

const Balances : Map<string, {available_bal:string , locked_bal:string}>  = new Map();

console.log("engine has started"); 


while(1){

    const response = await clientRead.xReadGroup("engine" // this is the consumer group name 
    , "engine" // this is the stream mw we read from 
     , [{

        key :"engine" ,
        id : ">"
    }], {
        BLOCK:0,
        COUNT :1
    }
)

if(!response){

    console.log("nothing found in the queue broo  bad luck ig ");
    continue; 
} 

const entry = response[0]?.messages[0];

if(!entry) continue ; 

console.log("engine req is reaching here ")

const message : {loopbackId : string } & toEngine = entry.message;

console.dir(response, { depth: null });

if(message.messageType == "create_market"){


    //check if the order book for that market exists 

    const existingbook = orderBook.find(
        (book) => book.marketId === message.marketId
    );

    if(existingbook){
        console.log("order book already exists with this id : " , existingbook.marketId)
    }
    else{

     const createdbook = {

        bids : new Map(),
        asks : new Map(),
        lastTradedPrice : -1 ,
        marketId : message.marketId


    }

    orderBook.push(createdbook);

    console.log("orderbook created as ");
console.dir(createdbook , {depth : null });

  }

    await publisher.xAdd("to-backend", "*" , {

    loopbackId: message.loopbackId ,
    // this tell that this id has been processed 
    result : JSON.stringify({success :true})
});

  
await clientRead.xAck(
    "engine",
    "engine",
    entry.id
);



}
if(message.messageType == "onRamp") {

    const balance = Balances.get(message.userId) ?? {

        available_bal: "0" ,
        locked_bal : "0" 
    }; // we retirivied the user balances 

    Balances.set(message.userId , { ...balance , available_bal : String(Number(balance.available_bal) + Number(message.amount))});

    // this need to update the user balance in the system 
    // this upadates the balance in the ram 
await publisher.xAdd("to-backend", "*" , {

    loopbackId: message.loopbackId, // this tell that this id been processed 
    result : JSON.stringify({success : true})
})

await clientRead.xAck(
    "engine",
    "engine",
    entry.id
); // this removes the msg form the plending entries list but the logs still persist 

}
//  now to publish the msg to the the other queue we need to publish the meassage 

if(message.messageType == "")





}