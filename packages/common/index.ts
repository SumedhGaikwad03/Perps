// lets start to make the common types in the engine and the data base for communication 


export type orderSide = "BID" | "ASK" 
export type TimeInForce = "GTC" | "FOK" 

export type OrderType = "LIMIT" | "MARKET"

// the as const at the end makes this specifically as read only tokens 
export const SUPPORTED_BASE_TOKEN = ["BTC","SOL","ETH"] as const; 

export type BaseToken = typeof SUPPORTED_BASE_TOKEN[number];


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
}|{
    messageType: "CREATE_MARKET", 

    marketId : string ,

    imgUrl? : string,

    slug : string , 

    baseToken : string , 

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

    } | {

        messageType : "CHECK_LIQUIDATIONS" , 

        marketId : string , 

        markPrice : string , 

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


    export interface Tradefill {

    price : string ;
    qty : string ;
    makerUserId : string ;
    makerOrderId : string ;
    makerUserLeverage : string ;
}

export interface TradeExecutedPayload {

    takerOrderId : string ;
    takerUserId : string ; 
    marketId : string ;
    fills : Tradefill[];
}

export interface OrderCancelledPayload {

    orderId : string ;
    userId : string ;
    marketId : string ;
    status : "CANCELLED" ;
}

export interface PositionLiquidatedPayload {

    status : string ;
    userId : string;
    marketId : string;
    equity : string;
    mrr : string ;
    markPrice?: string ;
}

export interface PositionBankruptPayload {

    status : string ;
    marketId : string ;
    userId : string ; 
    side : "LONG" | "SHORT" ;
    qty : string ;
    badDebt : string ;
    reason : string 
} 

export interface MarketCreatedPayload {

    marketId : string ,

    imgUrl? : string,

    slug : string , 

    baseToken : string , 

    symbol : string ,

    tickSize : string , 

    stepSize : string,}

export type dbEvent = 
 | "TRADE-EXECUTED" 
 | "ORDER-CANCELLED"
 | "POSITION-LIQUIDATED"
 | "POSITION-BANKRUPT"
 | "MARKET-CREATED";







// all the values are now created 



