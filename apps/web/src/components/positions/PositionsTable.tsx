import React, { useState } from "react";
import { useUserStore } from "../../stores/useUserStore";
import { useMarketStore } from "../../stores/useMarketStore";
import { orderService } from "../../services/api";
import { formatQty } from "../../utils/format";

export const PositionsTable: React.FC = () => {
  const { positions, fetchLiveUser } = useUserStore();
  const { markPrice, markets, activeMarket } = useMarketStore();
  const [closingMarketId, setClosingMarketId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterActiveMarket, setFilterActiveMarket] = useState(true);

  // Filter positions strictly for the current active market by default
  const displayedPositions = positions.filter((pos) => {
    if (!filterActiveMarket || !activeMarket) return true;
    const marketIdStr = String(pos.marketId || "");
    const posSymbol = (pos.symbol || "").toUpperCase();
    const activeSymbol = (activeMarket.symbol || "").toUpperCase();
    const posBase = (pos.baseToken || "").toUpperCase();
    const activeBase = (activeMarket.baseToken || "").toUpperCase();

    return (
      marketIdStr === activeMarket.id ||
      posSymbol === activeSymbol ||
      (posBase && activeBase && posBase === activeBase) ||
      (posSymbol.includes("BTC") && activeSymbol.includes("BTC"))
    );
  });

  const handleClosePosition = async (pos: any) => {
    setClosingMarketId(pos.marketId);
    setActionError(null);
    try {
      // close position via backend dedicated exitPosition endpoint
      const res = await orderService.exitPosition(pos.marketId, pos.qty);
      if (res?.result?.status === "CANCELLED" && (!res.result?.fills || res.result.fills.length === 0)) {
        setActionError("Close failed: No resting counterparty orders in the orderbook to match against. Place a Limit order.");
      }
      await fetchLiveUser();
    } catch (e: any) {
      console.warn("exitPosition endpoint fallback to market order:", e);
      try {
        const closeSide = pos.side === "LONG" ? "ASK" : "BID";
        const fallbackRes = await orderService.placeOrder({
          marketId: pos.marketId,
          side: closeSide,
          orderType: "MARKET",
          qty: pos.qty,
          leverage: pos.leverage,
          reduceOnly: true,
        });
        if (fallbackRes?.result?.status === "CANCELLED" && (!fallbackRes.result?.fills || fallbackRes.result.fills.length === 0)) {
          setActionError("Close cancelled: No resting counterparty orders in the orderbook. Place a Limit order.");
        }
        await fetchLiveUser();
      } catch (err: any) {
        setActionError(err.response?.data?.message || err.message || "Failed to close position.");
      }
    } finally {
      setClosingMarketId(null);
    }
  };

  if (displayedPositions.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center text-xs text-slate-500">
        <div>
          No active positions in <span className="font-bold text-slate-300">{activeMarket?.symbol || "BTC_USDC"}</span>.
        </div>
        {positions.length > 0 && filterActiveMarket && (
          <button
            onClick={() => setFilterActiveMarket(false)}
            className="mt-2 rounded bg-surface px-2.5 py-1 text-[11px] text-accent hover:text-white transition border border-borderDark"
          >
            Show {positions.length} position(s) in other markets
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto min-h-0">
      <div className="flex items-center justify-between px-3 py-1 bg-panel border-b border-borderDark/60 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span>Active Market:</span>
          <span className="font-bold text-white font-mono">{activeMarket?.symbol || "BTC_USDC"}</span>
          <span className="text-[10px] text-slate-500">({displayedPositions.length} position{displayedPositions.length === 1 ? "" : "s"})</span>
        </div>
        {positions.length > displayedPositions.length ? (
          <button
            onClick={() => setFilterActiveMarket(false)}
            className="text-accent hover:underline text-[10px]"
          >
            Show all markets ({positions.length})
          </button>
        ) : !filterActiveMarket && positions.length > 0 ? (
          <button
            onClick={() => setFilterActiveMarket(true)}
            className="text-accent hover:underline text-[10px]"
          >
            Filter to {activeMarket?.symbol || "BTC_USDC"}
          </button>
        ) : null}
      </div>

      {actionError && (
        <div className="mx-3 my-2 rounded bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs text-red-400 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-2 font-bold hover:text-white">✕</button>
        </div>
      )}
      <table className="w-full min-w-[760px] text-left font-mono text-xs">
        <thead>
          <tr className="border-b border-borderDark text-[10px] uppercase tracking-wider text-slate-400 sticky top-0 bg-panel z-10">
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
          {displayedPositions.map((pos, idx) => {
            const marketIdStr = String(pos.marketId || "");
            const marketObj = markets.find((m) => m.id === marketIdStr);
            const symbol = marketObj?.symbol || pos.symbol || (marketIdStr ? marketIdStr.slice(0, 8) : "BTC_USDC");
            const isLong = pos.side === "LONG";

            const entryNum = parseFloat(pos.entryPrice || "0");
            const sizeNum = parseFloat(pos.qty || "0");
            const marginNum = parseFloat(pos.margin || "1");
            const levNum = parseFloat(pos.leverage || "1");

            // Calculate live PnL against the specific market's mark price
            const isCurrentActive = activeMarket?.id === marketIdStr || activeMarket?.symbol === symbol;
            const isBtcMarket = symbol.toUpperCase().includes("BTC") || marketObj?.baseToken === "BTC" || pos.baseToken === "BTC";
            const liveActiveMark = parseFloat(markPrice || "0");
            const marketStoredMark = parseFloat(marketObj?.markPrice || marketObj?.lastTradedPrice || "0");

            // Prioritize live markPrice if active or if same base token (BTC)
            const markToUse = (isCurrentActive || isBtcMarket) && liveActiveMark > 0
              ? liveActiveMark
              : (marketStoredMark > 0 ? marketStoredMark : entryNum);

            const pnl = isLong ? (markToUse - entryNum) * sizeNum : (entryNum - markToUse) * sizeNum;
            const roe = marginNum > 0 ? (pnl / marginNum) * 100 : 0;
            const isProfitable = pnl >= 0;

            // Estimated liquidation price (MMR = 3%)
            const mmr = 0.03;
            const estLiqPrice =
              entryNum > 0 && levNum > 0
                ? isLong
                  ? Math.max(0, entryNum * (1 - 1 / levNum + mmr))
                  : entryNum * (1 + 1 / levNum - mmr)
                : 0;

            const finalLiqPrice =
              pos.liquidationPrice && parseFloat(pos.liquidationPrice) > 0
                ? parseFloat(pos.liquidationPrice)
                : estLiqPrice;

            const isClosing = closingMarketId === pos.marketId;

            return (
              <tr key={marketIdStr || idx} className="hover:bg-surface/50">
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
                <td className="py-2 px-3 text-slate-200">{formatQty(pos.qty, marketObj?.stepSize)}</td>
                <td className="py-2 px-3 text-slate-300">
                  ${entryNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2 px-3 text-slate-300">
                  ${markToUse.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2 px-3 text-ask">
                  ${finalLiqPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                    disabled={isClosing}
                    onClick={() => handleClosePosition(pos)}
                    className="rounded border border-ask/40 bg-ask/10 px-2 py-0.5 text-[11px] font-semibold text-ask transition hover:bg-ask hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isClosing ? "Closing..." : "Market Close"}
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
