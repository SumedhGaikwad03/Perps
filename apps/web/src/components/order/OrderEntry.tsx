import React, { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMarketStore } from "../../stores/useMarketStore";
import { useAuthStore } from "../../stores/useAuthStore";
import { useUserStore } from "../../stores/useUserStore";
import { orderService } from "../../services/api";
import { snapToTick, normalizeDecimal } from "../../utils/format";
import Decimal from "decimal.js";

interface OrderEntryProps {
  selectedPrice?: string | null;
}

export const OrderEntry: React.FC<OrderEntryProps> = ({ selectedPrice }) => {
  const [side, setSide] = useState<"BID" | "ASK">("BID");
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [timeInForce, setTimeInForce] = useState<"GTC" | "IOC" | "FOK">("GTC");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [leverage, setLeverage] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { activeMarket, markPrice, orderbook } = useMarketStore();
  const { isAuthenticated, wallet } = useAuthStore();
  const { fetchLiveUser } = useUserStore();

  // If user clicks a row in the orderbook, prefill snapped price
  useEffect(() => {
    if (selectedPrice && activeMarket?.tickSize) {
      setPrice(snapToTick(selectedPrice, activeMarket.tickSize));
    } else if (selectedPrice) {
      setPrice(selectedPrice);
    }
  }, [selectedPrice, activeMarket?.tickSize]);

  // Default price to snapped markPrice if empty
  useEffect(() => {
    if (!price && markPrice && parseFloat(markPrice) > 0) {
      const tick = activeMarket?.tickSize || "1";
      setPrice(snapToTick(markPrice, tick));
    }
  }, [markPrice, activeMarket?.tickSize]);

  const handleMidClick = () => {
    let midVal = markPrice || activeMarket?.markPrice || activeMarket?.lastTradedPrice || "89000";
    const bestBid = orderbook.bids?.[0]?.[0];
    const bestAsk = orderbook.asks?.[0]?.[0];
    if (bestBid && bestAsk) {
      try {
        const dMid = new Decimal(bestBid).plus(bestAsk).dividedBy(2);
        midVal = dMid.toString();
      } catch {}
    }
    const tick = activeMarket?.tickSize || "1";
    const snapped = snapToTick(midVal, tick);
    setPrice(snapped);
  };

  // Calculations: fallback to active market price if live stream has no ticks yet
  const currentMarkNum = parseFloat(markPrice || "0");
  const marketLastPrice = parseFloat(activeMarket?.lastTradedPrice || activeMarket?.markPrice || "0");
  const effectivePrice =
    orderType === "LIMIT"
      ? (parseFloat(price || "0") > 0 ? parseFloat(price) : (currentMarkNum > 0 ? currentMarkNum : (marketLastPrice > 0 ? marketLastPrice : 89000)))
      : (currentMarkNum > 0 ? currentMarkNum : (marketLastPrice > 0 ? marketLastPrice : 89000));

  const numericQty = parseFloat(qty || "0");
  const numericLev = parseFloat(leverage || "1");

  const notional = effectivePrice * numericQty;
  const initialMargin = numericLev > 0 ? notional / numericLev : 0;

  // Est. Liquidation Price: Price * (1 - (1/Lev) + MMR) for Long, Price * (1 + (1/Lev) - MMR) for Short
  const mmr = 0.03; // 3% maintenance margin
  const estLiqPrice =
    effectivePrice > 0 && numericLev > 0
      ? side === "BID"
        ? Math.max(0, effectivePrice * (1 - 1 / numericLev + mmr))
        : effectivePrice * (1 + 1 / numericLev - mmr)
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setError("Please sign in to place orders.");
      return;
    }
    if (!activeMarket) {
      setError("No active market selected.");
      return;
    }
    if (numericQty <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }
    if (orderType === "LIMIT" && parseFloat(price || "0") <= 0) {
      setError("Price must be greater than 0 for Limit orders.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const finalPrice = orderType === "LIMIT" ? normalizeDecimal(price.trim()) : undefined;
    const finalQty = normalizeDecimal(qty.trim());

    try {
      const res = await orderService.placeOrder({
        marketId: activeMarket.id,
        side,
        orderType,
        price: finalPrice,
        qty: finalQty,
        leverage,
        timeInForce,
        reduceOnly,
      });

      if (res.result?.status === "CANCELLED" && (!res.result?.fills || res.result.fills.length === 0)) {
        setError("Market order cancelled: No resting orders in orderbook to match against. Place a Limit order first.");
      } else {
        setSuccess(`Order submitted: ${res.orderId?.slice(0, 8)}... (${res.result?.status})`);
        setTimeout(() => setSuccess(null), 3000);
      }

      await fetchLiveUser();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to place order. Check margin requirements."
      );
    } finally {
      setLoading(false);
    }
  };

  const isLong = side === "BID";

  return (
    <div className="flex h-full flex-col bg-panel p-3 text-xs overflow-y-auto min-h-0">
      {/* Long / Short Tabs */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1 shrink-0">
        <button
          type="button"
          onClick={() => setSide("BID")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-bold transition ${
            isLong
              ? "bg-bid text-black shadow-md shadow-bid/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <ArrowUpRight className="h-4 w-4" />
          <span>Long / Buy</span>
        </button>

        <button
          type="button"
          onClick={() => setSide("ASK")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-bold transition ${
            !isLong
              ? "bg-ask text-white shadow-md shadow-ask/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <ArrowDownRight className="h-4 w-4" />
          <span>Short / Sell</span>
        </button>
      </div>

      {/* Limit / Market Switch */}
      <div className="mt-2.5 flex items-center gap-3 border-b border-borderDark pb-2 shrink-0">
        <button
          type="button"
          onClick={() => setOrderType("LIMIT")}
          className={`text-xs font-semibold ${
            orderType === "LIMIT" ? "text-accent border-b-2 border-accent pb-1" : "text-slate-400"
          }`}
        >
          Limit
        </button>
        <button
          type="button"
          onClick={() => setOrderType("MARKET")}
          className={`text-xs font-semibold ${
            orderType === "MARKET" ? "text-accent border-b-2 border-accent pb-1" : "text-slate-400"
          }`}
        >
          Market
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-[11px] text-red-400 shrink-0">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-2 rounded-lg bg-bid/10 border border-bid/20 p-2 text-[11px] text-bid shrink-0">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-2.5 flex flex-col gap-2.5 min-h-0">
        <div className="space-y-2.5">
          {/* Price Input */}
          {orderType === "LIMIT" && (
            <div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Order Price</span>
                <span className="font-mono text-slate-500">USDC</span>
              </div>
              <div className="relative mt-1">
                <input
                  type="number"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="89000.00"
                  className="w-full rounded-lg border border-borderDark bg-canvas py-2 pl-3 pr-12 font-mono font-medium text-white focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleMidClick}
                  className="absolute right-2 top-2 rounded bg-surface px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
                >
                  Mid
                </button>
              </div>
            </div>
          )}

          {/* Size / Qty Input */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Order Size</span>
              <span className="font-mono text-slate-500">{activeMarket?.baseToken || "BTC"}</span>
            </div>
            <div className="relative mt-1">
              <input
                type="number"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="1.0"
                className="w-full rounded-lg border border-borderDark bg-canvas py-2 pl-3 pr-14 font-mono font-medium text-white focus:border-accent focus:outline-none"
              />
              <span className="absolute right-3 top-2 text-xs font-semibold text-slate-500">
                {activeMarket?.baseToken || "BTC"}
              </span>
            </div>
          </div>

          {/* Leverage Slider */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Leverage</span>
              <span className="font-mono font-bold text-accent">{leverage}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-surface accent-accent"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-500 font-mono">
              <span>1x</span>
              <span>10x</span>
              <span>25x</span>
              <span>50x</span>
            </div>
          </div>

          {/* Time in Force Selector (GTC, IOC, FOK) */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Time in Force</span>
              <span className="font-mono text-[10px] text-accent font-semibold">{timeInForce}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-canvas p-1 border border-borderDark">
              {(["GTC", "IOC", "FOK"] as const).map((tif) => (
                <button
                  key={tif}
                  type="button"
                  onClick={() => setTimeInForce(tif)}
                  className={`rounded py-1 text-center font-mono text-[11px] font-semibold transition ${
                    timeInForce === tif
                      ? "bg-accent/20 text-accent font-bold border border-accent/40"
                      : "text-slate-400 hover:bg-surface hover:text-white"
                  }`}
                >
                  {tif}
                </button>
              ))}
            </div>
          </div>

          {/* Reduce Only Checkbox */}
          <div className="flex items-center justify-between py-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-300 hover:text-white transition">
              <input
                type="checkbox"
                checked={reduceOnly}
                onChange={(e) => setReduceOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border border-borderDark bg-canvas text-accent accent-accent focus:ring-0 cursor-pointer"
              />
              <span className="font-semibold">Reduce Only</span>
            </label>

            <span className="text-[10px] text-slate-500 font-mono">
              {reduceOnly ? "Position Exit Only" : "Normal Order"}
            </span>
          </div>

          {/* Margin Requirements Breakdown */}
          <div className="rounded-lg bg-canvas p-2.5 space-y-1.5 border border-borderDark font-mono text-[11px] shrink-0">
            <div className="flex justify-between text-slate-400">
              <span>Notional Value</span>
              <span className="text-white">${notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Initial Margin</span>
              <span className="text-white">${initialMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Est. Liq Price</span>
              <span className="text-ask">${estLiqPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between border-t border-borderDark/60 pt-1 text-slate-400">
              <span>Available Margin</span>
              <span className="text-slate-200">
                ${parseFloat(wallet.amountAvail || "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Submit Order Button */}
        <div className="mt-2 shrink-0 pb-1">
          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-lg py-2.5 text-sm font-bold shadow-lg transition disabled:opacity-50 ${
              isLong
                ? "bg-bid text-black shadow-bid/20 hover:bg-emerald-400"
                : "bg-ask text-white shadow-ask/20 hover:bg-red-600"
            }`}
          >
            {loading
              ? "Submitting to Engine..."
              : reduceOnly
              ? `${isLong ? "Reduce Long" : "Reduce Short"} ${qty} ${activeMarket?.baseToken || "BTC"}`
              : isLong
              ? `Open Long ${qty} ${activeMarket?.baseToken || "BTC"}`
              : `Open Short ${qty} ${activeMarket?.baseToken || "BTC"}`}
          </button>
        </div>
      </form>
    </div>
  );
};
