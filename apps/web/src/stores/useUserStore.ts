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
        // format positions from live redis hashes
        const positionsList: Position[] = [];
        if (live.positions) {
          for (const [marketId, posData] of Object.entries(live.positions)) {
            try {
              const parsed = typeof posData === "string" ? JSON.parse(posData) : posData;
              if (parsed && parseFloat(parsed.qty || "0") > 0) {
                positionsList.push({
                  marketId,
                  side: parsed.side || "LONG",
                  qty: parsed.qty,
                  entryPrice: parsed.entryPrice,
                  margin: parsed.margin,
                  leverage: parsed.leverage,
                  liquidationPrice: parsed.liquidationPrice,
                });
              }
            } catch {}
          }
        }

        // format open orders
        const ordersList: OpenOrder[] = [];
        if (live.openOrders) {
          for (const [orderId, orderData] of Object.entries(live.openOrders)) {
            try {
              const parsed = typeof orderData === "string" ? JSON.parse(orderData) : orderData;
              if (parsed) {
                ordersList.push({
                  orderId,
                  marketId: parsed.marketId,
                  side: parsed.side || "BID",
                  price: parsed.price,
                  qty: parsed.qty,
                  filledQty: parsed.filledQty || "0",
                  status: parsed.status || "OPEN",
                });
              }
            } catch {}
          }
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
