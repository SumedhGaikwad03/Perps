import React from "react";
import { useUserStore } from "../../stores/useUserStore";
import { useMarketStore } from "../../stores/useMarketStore";
import { orderService } from "../../services/api";

export const PositionsTable: React.FC = () => {
  const { positions, fetchLiveUser } = useUserStore();
  const { markPrice, markets, activeMarket } = useMarketStore();

  const handleClosePosition = async (pos: any) => {
    try {
      // close position via backend dedicated exitPosition endpoint
      await orderService.exitPosition(pos.marketId, pos.qty);
      await fetchLiveUser();
    } catch (e) {
      console.warn("exitPosition endpoint fallback to market order:", e);
      try {
        const closeSide = pos.side === "LONG" ? "ASK" : "BID";
        await orderService.placeOrder({
          marketId: pos.marketId,
          side: closeSide,
          orderType: "MARKET",
          qty: pos.qty,
          leverage: pos.leverage,
          reduceOnly: true,
        });
        await fetchLiveUser();
      } catch (err) {
        console.error("Failed to close position:", err);
      }
    }
  };

  if (positions.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center text-xs text-slate-500">
        No active positions. Open a Long or Short order above.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left font-mono text-xs">
        <thead>
          <tr className="border-b border-borderDark text-[10px] uppercase tracking-wider text-slate-400">
            <th className="py-2 px-3">Market</th>
            <th className="py-2 px-3">Side</th>
            <th className="py-2 px-3">Size</th>
            <th className="py-2 px-3">Entry Price</th>
            <th className="py-2 px-3">Mark Price</th>
            <th className="py-2 px-3">Liq Price</th>
            <th className="py-2 px-3">Margin</th>
            <th className="py-2 px-3">Unrealized PnL (ROE%)</th>
            <th className="py-2 px-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borderDark/40">
          {positions.map((pos) => {
            const marketObj = markets.find((m) => m.id === pos.marketId);
            const symbol = marketObj?.symbol || pos.marketId.slice(0, 8);
            const isLong = pos.side === "LONG";

            const entryNum = parseFloat(pos.entryPrice || "0");
            const sizeNum = parseFloat(pos.qty || "0");
            const marginNum = parseFloat(pos.margin || "1");

            // Calculate live PnL against the specific market's mark price
            const isCurrentActive = activeMarket?.id === pos.marketId;
            const liveActiveMark = parseFloat(markPrice || "0");
            const marketStoredMark = parseFloat(marketObj?.markPrice || marketObj?.lastTradedPrice || "0");
            const markToUse = isCurrentActive && liveActiveMark > 0
              ? liveActiveMark
              : (marketStoredMark > 0 ? marketStoredMark : entryNum);

            const pnl = isLong ? (markToUse - entryNum) * sizeNum : (entryNum - markToUse) * sizeNum;
            const roe = marginNum > 0 ? (pnl / marginNum) * 100 : 0;
            const isProfitable = pnl >= 0;

            return (
              <tr key={pos.marketId} className="hover:bg-surface/50">
                <td className="py-2 px-3 font-bold text-white">{symbol}</td>
                <td className="py-2 px-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      isLong ? "bg-bid/10 text-bid" : "bg-ask/10 text-ask"
                    }`}
                  >
                    {pos.side} {pos.leverage}x
                  </span>
                </td>
                <td className="py-2 px-3 text-slate-200">{pos.qty}</td>
                <td className="py-2 px-3 text-slate-300">
                  ${entryNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2 px-3 text-slate-300">
                  ${markToUse.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2 px-3 text-ask">
                  ${parseFloat(pos.liquidationPrice || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2 px-3 text-slate-300">
                  ${marginNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className={`py-2 px-3 font-bold ${isProfitable ? "text-bid" : "text-ask"}`}>
                  {isProfitable ? "+" : ""}${pnl.toFixed(2)} ({isProfitable ? "+" : ""}
                  {roe.toFixed(2)}%)
                </td>
                <td className="py-2 px-3 text-right">
                  <button
                    onClick={() => handleClosePosition(pos)}
                    className="rounded border border-ask/40 bg-ask/10 px-2 py-0.5 text-[11px] font-semibold text-ask transition hover:bg-ask hover:text-white"
                  >
                    Market Close
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
