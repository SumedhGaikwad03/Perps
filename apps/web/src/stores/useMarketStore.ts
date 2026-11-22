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
  fetchDepth: (marketId: string) => Promise<void>;
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
      const initialMark = active?.markPrice && parseFloat(active.markPrice) > 0 ? active.markPrice : state.markPrice;
      if (active) {
        setTimeout(() => get().fetchDepth(active.id), 0);
      }
      return { markets, activeMarket: active, markPrice: initialMark };
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
    get().fetchDepth(market.id);
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
          const target = stillExists || state.activeMarket || marketsData[0];
          if (target) {
            setTimeout(() => get().fetchDepth(target.id), 0);
          }
          return {
            markets: marketsData,
            activeMarket: target,
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

  fetchDepth: async (marketId: string) => {
    try {
      const res = await marketService.getDepth(marketId);
      const depthData = res?.data || res;
      if (depthData) {
        set((state) => ({
          orderbook: {
            bids: depthData.bids || [],
            asks: depthData.asks || [],
            lastTradedPrice: depthData.lastTradedPrice,
          },
          markPrice:
            depthData.markPrice && parseFloat(depthData.markPrice) > 0
              ? String(depthData.markPrice)
              : state.markPrice,
        }));
      }
    } catch (e) {
      console.error("Failed to fetch orderbook depth:", e);
    }
  },

  setActiveMarket: (market) => {
    set((state) => ({
      activeMarket: market,
      orderbook: { bids: [], asks: [] },
      trades: [],
      markPrice: market.markPrice && parseFloat(market.markPrice) > 0 ? market.markPrice : state.markPrice,
    }));
    get().fetchDepth(market.id);
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
      orderbook: {
        ...state.orderbook,
        lastTradedPrice: trade.price,
      },
    }));
  },

  setTrades: (trades) => set({ trades }),

  setMarkPrice: (price) => set({ markPrice: price }),
}));
