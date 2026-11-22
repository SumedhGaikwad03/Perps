import { create } from "zustand";
import type { Position, OpenOrder } from "../types";
import { userService } from "../services/api";

interface UserState {
  positions: Position[];
  openOrders: OpenOrder[];
  isLoading: boolean;
  setPositions: (positions: Position[]) => void;
  setOpenOrders: (orders: OpenOrder[]) => void;
  fetchLiveUser: () => Promise<void>;
  updateOrder: (order: Partial<OpenOrder> & { orderId: string }) => void;
}

export const useUserStore = create<UserState>((set) => ({
  positions: [],
  openOrders: [],
  isLoading: false,

  setPositions: (positions) => set({ positions }),
  setOpenOrders: (openOrders) => set({ openOrders }),

  updateOrder: (updated) => {
    set((state) => {
      if (updated.status === "FILLED" || updated.status === "CANCELLED") {
        return {
          openOrders: state.openOrders.filter((o) => o.orderId !== updated.orderId),
        };
      }
      return {
        openOrders: state.openOrders.map((o) =>
          o.orderId === updated.orderId ? { ...o, ...updated } : o
        ),
      };
    });
  },

  fetchLiveUser: async () => {
    try {
      set({ isLoading: true });
      const live = await userService.getLiveState();

      if (live) {
        const data = live?.data || live;

        // format positions from live redis hashes (backend returns data.postions array)
        const positionsList: Position[] = [];
        const rawPositions = data.postions || data.positions || [];
        const posArr = Array.isArray(rawPositions) ? rawPositions : Object.values(rawPositions);

        for (const posData of posArr) {
          try {
            const parsed = typeof posData === "string" ? JSON.parse(posData) : posData;
            if (parsed && parseFloat(parsed.qty || "0") > 0) {
              positionsList.push({
                marketId: parsed.marketId,
                symbol: parsed.symbol,
                baseToken: parsed.baseToken,
                side: parsed.side || (parseFloat(parsed.qty) > 0 ? "LONG" : "SHORT"),
                qty: String(parsed.qty),
                entryPrice: String(parsed.entryPrice || "0"),
                margin: String(parsed.margin || "0"),
                leverage: String(parsed.leverage || "1"),
                liquidationPrice: parsed.liquidationPrice ? String(parsed.liquidationPrice) : null,
              });
            }
          } catch {}
        }

        // format open orders (backend returns data.openOrders array)
        const ordersList: OpenOrder[] = [];
        const rawOrders = data.openOrders || [];
        const ordersArr = Array.isArray(rawOrders) ? rawOrders : Object.values(rawOrders);

        for (const orderData of ordersArr) {
          try {
            const parsed = typeof orderData === "string" ? JSON.parse(orderData) : orderData;
            if (parsed) {
              const status = parsed.status || "OPEN";
              const filledNum = parseFloat(parsed.filledQty ?? parsed.executeQty ?? "0");
              const qtyNum = parseFloat(parsed.qty || "0");

              // Skip orders that are completed or cancelled
              if (status === "FILLED" || status === "CANCELLED") continue;
              if (qtyNum > 0 && filledNum >= qtyNum) continue;

              ordersList.push({
                orderId: parsed.orderId || parsed.id,
                marketId: parsed.marketId,
                symbol: parsed.symbol,
                side: parsed.side || parsed.orderSide || "BID",
                price: String(parsed.price),
                qty: String(parsed.qty),
                filledQty: String(filledNum),
                status: filledNum > 0 ? "PARTIALLY_FILLED" : "OPEN",
                orderType: parsed.orderType || "LIMIT",
                timeInForce: parsed.timeInForce || "GTC",
                reduceOnly: Boolean(parsed.reduceOnly),
                createdAt: parsed.createdAt,
              });
            }
          } catch {}
        }

        set({ positions: positionsList, openOrders: ordersList });
      }
    } catch (err) {
      console.error("Failed to fetch live user state:", err);
    } finally {
      set({ isLoading: false });
    }
  },
}));
