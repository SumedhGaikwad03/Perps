import React from "react";
import { useMarketStore } from "../../stores/useMarketStore";
import { formatQty } from "../../utils/format";

export const TradeTape: React.FC = () => {
  const { trades } = useMarketStore();

  return (
    <div className="flex h-full flex-col bg-panel border-r border-borderDark text-xs">
      {/* Header */}
      <div className="flex h-8 items-center justify-between border-b border-borderDark px-3 font-semibold text-slate-400">
        <span>Recent Trades</span>
        <span className="text-[10px] text-slate-500 font-mono">Tape</span>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-3 py-1 text-[10px] font-semibold text-slate-500">
        <span>Price (USDC)</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>

      {/* Trades List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {trades.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-[11px] text-slate-600">
            Awaiting new trades...
          </div>
        ) : (
          trades.map((t, idx) => {
            const timeStr = new Date(t.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const isBuy = t.side === "BUY";

            return (
              <div
                key={`${t.timestamp}-${idx}`}
                className="grid grid-cols-3 px-3 py-0.5 font-mono text-[11px] hover:bg-surface"
              >
                <span className={`font-medium ${isBuy ? "text-bid" : "text-ask"}`}>
                  {parseFloat(t.price).toLocaleString()}
                </span>
                <span className="text-right text-slate-300">{formatQty(t.qty)}</span>
                <span className="text-right text-slate-500">{timeStr}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
