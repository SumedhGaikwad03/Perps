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

    baseToken : BaseToken , 

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

    baseToken : BaseToken , 

    symbol : string ,

    tickSize : string , 

    stepSize : string,}

// export type dbEvent = 
//  | "TRADE_EXECUTED" 
//  | "ORDER_CANCELLED"
//  | "POSITION_LIQUADATED"
//  | "POSITION_BANKRUPT"
//  | "MARKET_CREATED"
//  | "ORDER_ACCEPTED";

 // this code exits to prevent the ts form accendently a 
 // differnt event with a differnt type of payload 

 // its specifics the keys and the values specifed to that ts 
 export interface DbEventPayloadMap {

    TRADE_EXECUTED : TradeExecutedPayload,
    ORDER_CANCELLED : OrderCancelledPayload,
    POSITION_LIQUIDATED :PositionLiquidatedPayload,
    POSITION_BANKRUPT : PositionBankruptPayload,
    MARKET_CREATED : MarketCreatedPayload,
    ORDER_ACCEPTED: OrderAcceptedPayload,
    POSITION_UPDATED : PositionUpdatePayload

 }

 //Behind the scenes, dbEvent becomes:
//"TRADE_EXECUTED" | "ORDER_CANCELLED" | "POSITION_LIQUIDATED" | 
// "POSITION_BANKRUPT" | "MARKET_CREATED" | "ORDER_ACCEPTED"

 export type dbEvent = keyof DbEventPayloadMap ;

 export type DbEventMessage ={
    [k in dbEvent]:{
     eventType : k ;
     payload : DbEventPayloadMap[k]
 };

 }[dbEvent];
 // extract only values the suppiled db event  

 // this is narrow typing in ts 


 export interface OrderAcceptedPayload {

    orderId : string ;
    userId : string ;
    marketId : string ;

    orderType : OrderType;
    orderSide : orderSide ;

    price : string | null ;
    qty : string ;

    timeInForce : TimeInForce ;
    reduceOnly : boolean ;

    initialMargin : string ;
    lockedMargin : string ; 
 }

 export interface WalletTransactionPayload {

    userId : string ,
    amountAvail : string , 
    amountLocked : string ,

}

export interface PositionUpdatePayload{

    userId : string,
    marketId : string ,
    size : string ,
    entryPrice : string,
    leverage : number ,
     liquidationPrice : string | null 
}






// all the values are now created 



