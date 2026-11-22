import React, { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMarketStore } from "../../stores/useMarketStore";
import { useAuthStore } from "../../stores/useAuthStore";
import { useUserStore } from "../../stores/useUserStore";
import { orderService } from "../../services/api";

interface OrderEntryProps {
  selectedPrice?: string | null;
}

export const OrderEntry: React.FC<OrderEntryProps> = ({ selectedPrice }) => {
  const [side, setSide] = useState<"BID" | "ASK">("BID");
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [leverage, setLeverage] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { activeMarket, markPrice } = useMarketStore();
  const { isAuthenticated, wallet } = useAuthStore();
  const { fetchLiveUser } = useUserStore();

  // If user clicks a row in the orderbook, prefill price
  useEffect(() => {
    if (selectedPrice) {
      setPrice(selectedPrice);
    }
  }, [selectedPrice]);

  // Default price to markPrice if empty
  useEffect(() => {
    if (!price && markPrice && parseFloat(markPrice) > 0) {
      setPrice(markPrice);
    }
  }, [markPrice]);

  // Calculations
  const numericPrice = parseFloat(price || markPrice || "0");
  const numericQty = parseFloat(qty || "0");
  const numericLev = parseFloat(leverage || "1");

  const notional = numericPrice * numericQty;
  const initialMargin = numericLev > 0 ? notional / numericLev : 0;

  // Est. Liquidation Price: Price * (1 - (1/Lev) + MMR) for Long, Price * (1 + (1/Lev) - MMR) for Short
  const mmr = 0.03; // 3% maintenance margin
  const estLiqPrice =
    numericPrice > 0 && numericLev > 0
      ? side === "BID"
        ? Math.max(0, numericPrice * (1 - 1 / numericLev + mmr))
        : numericPrice * (1 + 1 / numericLev - mmr)
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
    if (orderType === "LIMIT" && numericPrice <= 0) {
      setError("Price must be greater than 0.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await orderService.placeOrder({
        marketId: activeMarket.id,
        side,
        orderType,
        price: orderType === "LIMIT" ? price : (markPrice || "89000"),
        qty,
        leverage,
      });

      setSuccess(`Order submitted: ${res.orderId?.slice(0, 8)}... (${res.result?.status})`);
      await fetchLiveUser();
      setTimeout(() => setSuccess(null), 3000);
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
    <div className="flex h-full flex-col bg-panel p-3.5 text-xs">
      {/* Long / Short Tabs */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1">
        <button
          type="button"
          onClick={() => setSide("BID")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-2 font-bold transition ${
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
          className={`flex items-center justify-center gap-1.5 rounded-md py-2 font-bold transition ${
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
      <div className="mt-3 flex items-center gap-3 border-b border-borderDark pb-2.5">
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
        <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-[11px] text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-3 rounded-lg bg-bid/10 border border-bid/20 p-2 text-[11px] text-bid">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex flex-1 flex-col justify-between">
        <div className="space-y-3">
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
                  onClick={() => setPrice(markPrice || "89000")}
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

          {/* Margin Requirements Breakdown */}
          <div className="rounded-lg bg-canvas p-2.5 space-y-1.5 border border-borderDark font-mono text-[11px]">
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
        <div className="mt-4">
          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-lg py-3 text-sm font-bold shadow-lg transition disabled:opacity-50 ${
              isLong
                ? "bg-bid text-black shadow-bid/20 hover:bg-emerald-400"
                : "bg-ask text-white shadow-ask/20 hover:bg-red-600"
            }`}
          >
            {loading
              ? "Submitting to Engine..."
              : isLong
              ? `Open Long ${qty} ${activeMarket?.baseToken || "BTC"}`
              : `Open Short ${qty} ${activeMarket?.baseToken || "BTC"}`}
          </button>
        </div>
      </form>
    </div>
  );
};
