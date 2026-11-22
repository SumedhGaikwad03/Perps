import { create } from "zustand";
import type { Market, OrderbookData, TradeFill } from "../types";
import { marketService } from "../services/api";

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
  addMarket: (market: Market) => void;
  fetchMarkets: () => Promise<Market[]>;
}

export const useMarketStore = create<MarketState>((set, get) => ({
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

  addMarket: (market) => {
    set((state) => {
      const existing = state.markets.find((m) => m.id === market.id || m.symbol === market.symbol);
      if (existing) return state;
      return {
        markets: [market, ...state.markets],
        activeMarket: market,
      };
    });
  },

  fetchMarkets: async () => {
    try {
      const marketsData = await marketService.getMarkets();
      if (Array.isArray(marketsData) && marketsData.length > 0) {
        set((state) => {
          const currentActive = state.activeMarket;
          const stillExists = currentActive
            ? marketsData.find((m: Market) => m.id === currentActive.id || m.symbol === currentActive.symbol)
            : null;
          return {
            markets: marketsData,
            activeMarket: stillExists || state.activeMarket || marketsData[0],
          };
        });
        return marketsData;
      }
      return get().markets;
    } catch (err) {
      console.error("Failed to fetch markets:", err);
      return get().markets;
    }
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
