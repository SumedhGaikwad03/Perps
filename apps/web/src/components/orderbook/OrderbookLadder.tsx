import React, { useMemo } from "react";
import { useMarketStore } from "../../stores/useMarketStore";
import { formatQty } from "../../utils/format";
import Decimal from "decimal.js";

interface OrderbookLadderProps {
  onSelectPrice?: (price: string) => void;
}

export const OrderbookLadder: React.FC<OrderbookLadderProps> = ({ onSelectPrice }) => {
  const { orderbook, markPrice, activeMarket } = useMarketStore();

  // Process and sort asks (ascending by price, then take top 12 reversed for display)
  const processedAsks = useMemo(() => {
    const raw = [...(orderbook.asks || [])];
    raw.sort((a, b) => new Decimal(a[0]).minus(b[0]).toNumber());
    const sliced = raw.slice(0, 12);

    let runningTotal = new Decimal(0);
    const withTotals = sliced.map(([p, q]) => {
      const dQty = new Decimal(q || 0);
      runningTotal = runningTotal.plus(dQty);
      return { price: p, qty: q, total: runningTotal.toString() };
    });

    // reverse for visual ladder (highest ask at top, best ask nearest spread)
    return withTotals.reverse();
  }, [orderbook.asks]);

  // Process and sort bids (descending by price, best bid nearest spread)
  const processedBids = useMemo(() => {
    const raw = [...(orderbook.bids || [])];
    raw.sort((a, b) => new Decimal(b[0]).minus(a[0]).toNumber());
    const sliced = raw.slice(0, 12);

    let runningTotal = new Decimal(0);
    return sliced.map(([p, q]) => {
      const dQty = new Decimal(q || 0);
      runningTotal = runningTotal.plus(dQty);
      return { price: p, qty: q, total: runningTotal.toString() };
    });
  }, [orderbook.bids]);

  // Compute maximum depth total for bar scaling
  const maxTotal = useMemo(() => {
    const maxAsk = processedAsks.length > 0 ? parseFloat(processedAsks[0]?.total || "1") : 1;
    const maxBid =
      processedBids.length > 0
        ? parseFloat(processedBids[processedBids.length - 1]?.total || "1")
        : 1;
    return Math.max(maxAsk, maxBid, 1);
  }, [processedAsks, processedBids]);

  // Spread calculation using Decimal
  const bestAsk = processedAsks.length > 0 ? new Decimal(processedAsks[processedAsks.length - 1]!.price) : null;
  const bestBid = processedBids.length > 0 ? new Decimal(processedBids[0]!.price) : null;
  const spread = bestAsk && bestBid ? bestAsk.minus(bestBid).toString() : "0.00";

  return (
    <div className="flex h-full flex-col bg-panel text-xs">
      {/* Header */}
      <div className="shrink-0 flex h-8 items-center justify-between border-b border-borderDark px-3 font-semibold text-slate-400">
        <span>Order Book (L2)</span>
        <span className="text-[10px] text-slate-500 font-mono">Real-time</span>
      </div>

      {/* Column Headers */}
      <div className="shrink-0 grid grid-cols-3 px-3 py-1 text-[10px] font-semibold text-slate-500">
        <span>Price (USDC)</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (Red) */}
      <div className="flex flex-1 min-h-0 flex-col justify-end overflow-hidden">
        {processedAsks.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-[11px] text-slate-600">
            No resting asks
          </div>
        ) : (
          processedAsks.map((ask) => {
            const depthPct = Math.min(100, (parseFloat(ask.total) / maxTotal) * 100);
            return (
              <div
                key={`ask-${ask.price}`}
                onClick={() => onSelectPrice && onSelectPrice(ask.price)}
                className="group relative grid grid-cols-3 cursor-pointer px-3 py-0.5 font-mono text-[11px] hover:bg-surface"
              >
                {/* Visual Depth Bar Fill */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-ask-dim transition-all"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="relative z-10 text-ask font-medium">{ask.price}</span>
                <span className="relative z-10 text-right text-slate-300">{formatQty(ask.qty, activeMarket?.stepSize)}</span>
                <span className="relative z-10 text-right text-slate-400">{formatQty(ask.total, activeMarket?.stepSize)}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Mid-Market Spread Banner */}
      <div className="shrink-0 flex items-center justify-between border-y border-borderDark bg-canvas px-3 py-1 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">
            ${(orderbook.lastTradedPrice && parseFloat(orderbook.lastTradedPrice) > 0 ? parseFloat(orderbook.lastTradedPrice) : parseFloat(markPrice || "0")).toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500">Last</span>
        </div>
        <div className="text-[10px] text-slate-400">
          Spread: <span className="text-white">${spread}</span>
        </div>
      </div>

      {/* Bids (Green) */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {processedBids.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-[11px] text-slate-600">
            No resting bids
          </div>
        ) : (
          processedBids.map((bid) => {
            const depthPct = Math.min(100, (parseFloat(bid.total) / maxTotal) * 100);
            return (
              <div
                key={`bid-${bid.price}`}
                onClick={() => onSelectPrice && onSelectPrice(bid.price)}
                className="group relative grid grid-cols-3 cursor-pointer px-3 py-0.5 font-mono text-[11px] hover:bg-surface"
              >
                {/* Visual Depth Bar Fill */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-bid-dim transition-all"
                  style={{ width: `${depthPct}%` }}
                />
                <span className="relative z-10 text-bid font-medium">{bid.price}</span>
                <span className="relative z-10 text-right text-slate-300">{formatQty(bid.qty, activeMarket?.stepSize)}</span>
                <span className="relative z-10 text-right text-slate-400">{formatQty(bid.total, activeMarket?.stepSize)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
