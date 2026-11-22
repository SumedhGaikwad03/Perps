export interface Market {
  id: string;
  symbol: string;
  slug: string;
  baseToken: string;
  tickSize: string;
  stepSize: string;
  imgUrl?: string;
  lastTradedPrice?: string;
  markPrice?: string;
  priceChangePercent24h?: string;
  high24h?: string;
  low24h?: string;
  volume24h?: string;
}

export interface CreateMarketInput {
  symbol: string;
  slug: string;
  baseToken: "BTC" | "SOL" | "ETH";
  imgUrl?: string;
  tickSize?: string;
  stepSize?: string;
}

export interface CreateMarketResponse {
  id: string;
  message: string;
  engineStatus?: any;
}

export type OrderbookLevel = [price: string, qty: string];

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  lastTradedPrice?: string;
}

export interface TradeFill {
  price: string;
  qty: string;
  timestamp: number;
  side: "BUY" | "SELL";
  makerOrderId?: string;
  takerOrderId?: string;
}

export interface Position {
  userId?: string;
  marketId: string;
  symbol?: string;
  baseToken?: string;
  side: "LONG" | "SHORT";
  qty: string;
  entryPrice: string;
  margin: string;
  leverage: string;
  liquidationPrice?: string | null;
  unrealizedPnl?: number;
  roe?: number;
}

export interface OpenOrder {
  orderId: string;
  marketId: string;
  symbol?: string;
  side: "BID" | "ASK";
  price: string;
  qty: string;
  filledQty: string;
  status: string;
  orderType?: "LIMIT" | "MARKET";
  timeInForce?: "GTC" | "IOC" | "FOK";
  reduceOnly?: boolean;
  createdAt?: string | number;
}

export interface UserWallet {
  amountAvail: string;
  amountLocked: string;
}

export interface UserProfile {
  id: string;
  username: string;
  token: string;
}
