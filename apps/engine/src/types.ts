// Exact types extracted from apps/engine/index.ts

export const SUPPORTED_BASE_TOKEN = ["BTC", "SOL", "ETH"] as const;
export type BaseToken = (typeof SUPPORTED_BASE_TOKEN)[number];

export interface UserBalance {
  available_bal: string;
  locked_bal: string;
}

export type OpenOrder = {
  userId: string;
  originalOrderId: string;
  filledQty: string;
  lockedMargin: string;
  reduceOnly: boolean;
  qty: string;
  leverage: string;
};

export type PriceLevel = {
  totalQty: string;
  orders: OpenOrder[];
};

export interface OrderBook {
  bids: Map<string, PriceLevel>;
  asks: Map<string, PriceLevel>;
  lastTradedPrice: number;
  marketId: string;
  baseToken: string;
  symbol: string;
  tickSize: string;
  stepSize: string;
}

export interface Position {
  userId: string;
  marketId: string;
  side: "LONG" | "SHORT";
  qty: string;
  baseToken: string;
  entryPrice: string;
  margin: string;
  leverage: string;
}
