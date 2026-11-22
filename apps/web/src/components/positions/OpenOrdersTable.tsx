import React from "react";
import { useUserStore } from "../../stores/useUserStore";
import { useMarketStore } from "../../stores/useMarketStore";
import { orderService } from "../../services/api";
import { formatQty } from "../../utils/format";

export const OpenOrdersTable: React.FC = () => {
  const { openOrders, fetchLiveUser } = useUserStore();
  const { markets } = useMarketStore();

  const handleCancel = async (order: any) => {
    try {
      await orderService.cancelOrder(order.orderId, order.marketId, order.side);
      await fetchLiveUser();
    } catch (e) {
      console.error("Failed to cancel order:", e);
    }
  };

  if (openOrders.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center text-xs text-slate-500">
        No active resting orders in the book.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto min-h-0">
      <table className="w-full min-w-[760px] text-left font-mono text-xs">
        <thead>
          <tr className="border-b border-borderDark text-[10px] uppercase tracking-wider text-slate-400 sticky top-0 bg-panel z-10">
            <th className="py-2 px-3">Order ID</th>
            <th className="py-2 px-3">Market</th>
            <th className="py-2 px-3">Side</th>
            <th className="py-2 px-3">Price</th>
            <th className="py-2 px-3">Quantity</th>
            <th className="py-2 px-3">Filled</th>
            <th className="py-2 px-3">TIF</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borderDark/40">
          {openOrders.map((order, idx) => {
            const orderIdStr = String(order.orderId || "");
            const marketIdStr = String(order.marketId || "");
            const marketObj = markets.find((m) => m.id === marketIdStr);
            const symbol = marketObj?.symbol || (marketIdStr ? marketIdStr.slice(0, 8) : "BTC_USDC");
            const isBuy = order.side === "BID";
            const priceNum = parseFloat(order.price || "0");

            return (
              <tr key={orderIdStr || idx} className="hover:bg-surface/50">
                <td className="py-2 px-3 text-slate-400">
                  {orderIdStr ? `${orderIdStr.slice(0, 8)}...` : "—"}
                </td>
                <td className="py-2 px-3 font-bold text-white">{symbol}</td>
                <td className="py-2 px-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      isBuy ? "bg-bid/10 text-bid" : "bg-ask/10 text-ask"
                    }`}
                  >
                    {isBuy ? "BUY" : "SELL"}
                  </span>
                </td>
                <td className="py-2 px-3 text-slate-200">
                  ${priceNum > 0 ? priceNum.toLocaleString() : "MARKET"}
                </td>
                <td className="py-2 px-3 text-slate-300">{formatQty(order.qty, marketObj?.stepSize)}</td>
                <td className="py-2 px-3 font-mono font-medium text-slate-200">
                  {formatQty(order.filledQty, marketObj?.stepSize)}
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    <span className="rounded bg-surface px-1 py-0.5 text-slate-300 font-semibold">
                      {order.timeInForce || "GTC"}
                    </span>
                    {order.reduceOnly && (
                      <span className="rounded bg-amber-500/10 px-1 py-0.5 text-amber-400 font-bold" title="Reduce Only">
                        RO
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      order.status === "PARTIALLY_FILLED"
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-accent/10 text-accent"
                    }`}
                  >
                    {order.status === "PARTIALLY_FILLED" ? "PARTIAL" : (order.status || "OPEN")}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <button
                    onClick={() => handleCancel(order)}
                    className="rounded border border-slate-600 bg-surface px-2 py-0.5 text-[11px] font-medium text-slate-300 transition hover:border-ask hover:bg-ask hover:text-white"
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
