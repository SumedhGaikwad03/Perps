import { create } from "zustand";
import type { Market, OrderbookData, TradeFill } from "../types";

interface MarketState {
  markets: Market[];
  activeMarket: Market | null;
  orderbook: OrderbookData;
  trades: TradeFill[];
  markPrice: string;
  setMarkets: (markets: Market[]) => void;
  setActiveMarket: (market: Market) => void;
  setOrderbook: (data: Partial<OrderbookData>) => void;
  addTrade: (trade: TradeFill) => void;
  setTrades: (trades: TradeFill[]) => void;
  setMarkPrice: (price: string) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  markets: [],
  activeMarket: null,
  orderbook: { bids: [], asks: [] },
  trades: [],
  markPrice: "0",

  setMarkets: (markets) => {
    set((state) => {
      const active = state.activeMarket || markets[0] || null;
      return { markets, activeMarket: active };
    });
  },

  setActiveMarket: (market) => {
    set({
      activeMarket: market,
      orderbook: { bids: [], asks: [] },
      trades: [],
    });
  },

  setOrderbook: (data) => {
    set((state) => ({
      orderbook: {
        ...state.orderbook,
        ...data,
      },
    }));
  },

  addTrade: (trade) => {
    set((state) => ({
      trades: [trade, ...state.trades.slice(0, 49)], // keep last 50 trades
      markPrice: trade.price,
    }));
  },

  setTrades: (trades) => set({ trades }),

  setMarkPrice: (price) => set({ markPrice: price }),
}));
