import React, { useState, useEffect, useRef } from "react";
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
  const { isAuthenticated, wallet, openAuthModal } = useAuthStore();
  const { positions, fetchLiveUser } = useUserStore();

  // Find active position for the selected market
  const activeMarketPosition = positions.find((p) => {
    const marketIdStr = String(p.marketId || "");
    const posSymbol = (p.symbol || "").toUpperCase();
    const activeSymbol = (activeMarket?.symbol || "").toUpperCase();
    const posBase = (p.baseToken || "").toUpperCase();
    const activeBase = (activeMarket?.baseToken || "").toUpperCase();

    return (
      marketIdStr === activeMarket?.id ||
      posSymbol === activeSymbol ||
      (posBase && activeBase && posBase === activeBase) ||
      (posSymbol.includes("BTC") && activeSymbol.includes("BTC"))
    );
  });

  // Tracks whether price has been initialized for the current active market
  const initializedMarketId = useRef<string | null>(null);

  // If user clicks a row in the orderbook, prefill snapped price (explicit user action)
  useEffect(() => {
    if (selectedPrice && activeMarket?.tickSize) {
      setPrice(snapToTick(selectedPrice, activeMarket.tickSize));
    } else if (selectedPrice) {
      setPrice(selectedPrice);
    }
  }, [selectedPrice, activeMarket?.tickSize]);

  // Default price to snapped markPrice ONCE per market so typing a custom limit price isn't overwritten by live ticks
  useEffect(() => {
    if (!activeMarket?.id) return;
    if (initializedMarketId.current === activeMarket.id) return;

    const basePrice = markPrice || activeMarket.markPrice || activeMarket.lastTradedPrice;
    if (basePrice && parseFloat(basePrice) > 0) {
      initializedMarketId.current = activeMarket.id;
      const tick = activeMarket.tickSize || "1";
      setPrice(snapToTick(basePrice, tick));
    }
  }, [activeMarket?.id, markPrice, activeMarket?.tickSize, activeMarket?.markPrice, activeMarket?.lastTradedPrice]);

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
  // Reduce Only orders require $0 initial margin because they close/reduce an existing position
  const initialMargin = reduceOnly ? 0 : (numericLev > 0 ? notional / numericLev : 0);

  // Est. Liquidation Price: Price * (1 - (1/Lev) + MMR) for Long, Price * (1 + (1/Lev) - MMR) for Short
  const mmr = 0.03; // 3% maintenance margin
  const estLiqPrice =
    effectivePrice > 0 && numericLev > 0
      ? side === "BID"
        ? Math.max(0, effectivePrice * (1 - 1 / numericLev + mmr))
        : effectivePrice * (1 + 1 / numericLev - mmr)
      : 0;

  // Quick percentage sizing: if reduceOnly and position exists, size from position; otherwise from available margin
  const handlePercentageSize = (pct: number) => {
    const step = parseFloat(activeMarket?.stepSize || "0.001");
    const decimals = step < 1 ? (step.toString().split(".")[1] || "").length : 0;

    if (reduceOnly && activeMarketPosition) {
      const posQty = parseFloat(activeMarketPosition.qty || "0");
      if (posQty > 0) {
        setQty((posQty * pct).toFixed(decimals));
        return;
      }
    }

    const availBal = parseFloat(wallet.amountAvail || "0");
    if (availBal <= 0 || effectivePrice <= 0) return;
    const lev = Math.max(1, parseFloat(leverage || "1"));
    const targetMargin = availBal * pct;
    const targetNotional = targetMargin * lev;
    const calcQty = targetNotional / effectivePrice;
    setQty(calcQty.toFixed(decimals));
  };

  const isLong = side === "BID";

  // Direction validation for Reduce Only
  const isReduceDirectionInvalid =
    reduceOnly &&
    (!activeMarketPosition ||
      (activeMarketPosition.side === "SHORT" && !isLong) ||
      (activeMarketPosition.side === "LONG" && isLong));

  const reduceDirectionError = !activeMarketPosition
    ? `No active ${activeMarket?.symbol || "BTC_USDC"} position found to reduce.`
    : activeMarketPosition.side === "SHORT" && !isLong
    ? "You hold a SHORT position. Switch to Long / Buy to reduce it."
    : activeMarketPosition.side === "LONG" && isLong
    ? "You hold a LONG position. Switch to Short / Sell to reduce it."
    : null;

  const isMarginExceeded = !reduceOnly && initialMargin > parseFloat(wallet.amountAvail || "0");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      openAuthModal();
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

    if (reduceOnly && isReduceDirectionInvalid) {
      setError(reduceDirectionError || "Cannot place reduce-only order: invalid direction.");
      return;
    }

    const availBal = parseFloat(wallet.amountAvail || "0");
    if (!reduceOnly && initialMargin > availBal) {
      setError(
        `Insufficient available margin ($${availBal.toLocaleString(undefined, { maximumFractionDigits: 2 })} available, $${initialMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })} required). Deposit funds or reduce order size.`
      );
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

            {/* Quick Sizing Buttons */}
            <div className="grid grid-cols-4 gap-1 mt-1.5 font-mono text-[10px]">
              {[0.25, 0.5, 0.75, 1.0].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercentageSize(pct)}
                  className="rounded bg-canvas border border-borderDark py-0.5 text-slate-400 hover:border-accent hover:text-white transition"
                >
                  {reduceOnly && activeMarketPosition
                    ? pct === 1.0 ? "100%" : `${pct * 100}%`
                    : pct === 1.0 ? "Max" : `${pct * 100}%`}
                </button>
              ))}
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

          {/* Reduce Only Control Panel */}
          <div className="rounded-lg bg-canvas border border-borderDark p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-200 hover:text-white transition">
                <input
                  type="checkbox"
                  checked={reduceOnly}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setReduceOnly(checked);
                    if (checked && activeMarketPosition) {
                      setSide(activeMarketPosition.side === "SHORT" ? "BID" : "ASK");
                      const step = parseFloat(activeMarket?.stepSize || "0.001");
                      const decimals = step < 1 ? (step.toString().split(".")[1] || "").length : 0;
                      setQty(parseFloat(activeMarketPosition.qty).toFixed(decimals));
                    }
                  }}
                  className="h-3.5 w-3.5 rounded border border-borderDark bg-surface text-accent accent-accent focus:ring-0 cursor-pointer"
                />
                <span className="font-bold">Reduce Only</span>
              </label>

              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  reduceOnly
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "text-slate-500"
                }`}
              >
                {reduceOnly ? "No locked balance needed" : "Normal Order"}
              </span>
            </div>

            {reduceOnly && (
              <div className="text-[10px] text-slate-400 border-t border-borderDark/40 pt-1.5 flex items-center justify-between">
                <span>Position to Close:</span>
                {activeMarketPosition ? (
                  <span className="font-mono font-bold text-white flex items-center gap-1.5">
                    <span className={activeMarketPosition.side === "LONG" ? "text-bid" : "text-ask"}>
                      {activeMarketPosition.side}
                    </span>
                    <span>
                      {activeMarketPosition.qty} {activeMarket?.baseToken || "BTC"}
                    </span>
                  </span>
                ) : (
                  <span className="text-amber-400 font-mono">None (0.00)</span>
                )}
              </div>
            )}
          </div>

          {/* Margin Requirements Breakdown */}
          <div className="rounded-lg bg-canvas p-2.5 space-y-1.5 border border-borderDark font-mono text-[11px] shrink-0">
            <div className="flex justify-between text-slate-400">
              <span>Notional Value</span>
              <span className="text-white">${notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Initial Margin</span>
              {reduceOnly ? (
                <span className="text-bid font-bold flex items-center gap-1">
                  $0.00 <span className="text-[10px] text-emerald-400 font-normal font-sans">(No locked balance needed)</span>
                </span>
              ) : (
                <span className={isMarginExceeded ? "text-ask font-bold" : "text-white"}>
                  ${initialMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {isMarginExceeded && " (Exceeds Avail)"}
                </span>
              )}
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Est. Liq Price</span>
              {reduceOnly ? (
                <span className="text-slate-400 font-mono">— (Closing Position)</span>
              ) : (
                <span className="text-ask">${estLiqPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              )}
            </div>

            <div className="flex justify-between border-t border-borderDark/60 pt-1 text-slate-400">
              <span>Available Margin</span>
              <span className="text-slate-200">
                ${parseFloat(wallet.amountAvail || "0").toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Reduce Only Direction Warning */}
        {reduceOnly && isReduceDirectionInvalid && (
          <div className="mt-1 rounded bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-[11px] text-amber-400">
            {reduceDirectionError}
          </div>
        )}

        {/* Submit Order Button */}
        <div className="mt-2 shrink-0 pb-1">
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={openAuthModal}
              className="w-full rounded-lg py-2.5 text-sm font-bold shadow-lg transition bg-accent text-white shadow-accent/20 hover:bg-blue-600"
            >
              Sign In to Trade
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading || (reduceOnly ? isReduceDirectionInvalid : isMarginExceeded)}
              className={`w-full rounded-lg py-2.5 text-sm font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                reduceOnly && isReduceDirectionInvalid
                  ? "bg-slate-700 text-amber-300 border border-amber-500/30"
                  : isMarginExceeded
                  ? "bg-slate-700 text-slate-400 border border-slate-600"
                  : isLong
                  ? "bg-bid text-black shadow-bid/20 hover:bg-emerald-400"
                  : "bg-ask text-white shadow-ask/20 hover:bg-red-600"
              }`}
            >
              {loading
                ? "Submitting to Engine..."
                : reduceOnly
                ? !activeMarketPosition
                  ? "No Position to Reduce"
                  : isReduceDirectionInvalid
                  ? activeMarketPosition.side === "SHORT"
                    ? "Switch to Long / Buy to Reduce Short"
                    : "Switch to Short / Sell to Reduce Long"
                  : activeMarketPosition.side === "SHORT"
                  ? `Reduce Short ${qty} ${activeMarket?.baseToken || "BTC"}`
                  : `Reduce Long ${qty} ${activeMarket?.baseToken || "BTC"}`
                : isMarginExceeded
                ? "Insufficient Available Margin"
                : isLong
                ? `Open Long ${qty} ${activeMarket?.baseToken || "BTC"}`
                : `Open Short ${qty} ${activeMarket?.baseToken || "BTC"}`}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
