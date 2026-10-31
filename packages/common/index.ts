// lets start to make the common types in the engine and the data base for communication 


export type orderSide = "BID" | "ASK" 
export type TimeInForce = "GTC" | "FOK" 

export type OrderType = "LIMIT" | "MARKET"


export type toEngine =  {

    messageType :"ON_RAMP",
    userId :string,
    amount : string  // this is the type 

} |{

    messageType : "CANCEL_ORDER",
    userId : string ,
    orderId : string , // in a tradition sense we should let the http layer decide what need to be done but here we want high
    // frequenct trades so we are making sure the number of jumps are limited and minimum 
     marketId : string 
} | {

    messageType: "CREATE_MARKET", 

    marketId : string ,

    imgUrl? : string,

    slug : string , 

    symbol : string ,

    tickSize : string , 

    stepSize : string

}

| {

    messageType : "CREATE_ORDER"

    userId : string , 

    orderId : string ,

    marketId : string , 

    qty :   string   , 

    price? : string ,

    orderType : OrderType ,

    leverage : string , 


    timeInForce : TimeInForce ,

    side : orderSide ,  

    reduceOnly : boolean , 

    }


    export interface EngineStreamEntry { 

        loopbackId : string ;
        payload : string ;
    }

    export type EngineResponseStatus = "SUCCESS" | "REJECTED" | "ERROR"


    export interface EngineResponsePayload {

        loopbackId : string;
        status : EngineResponseStatus;
        data?: unknown;
        error?:string
    } 



// all the values are now created 



