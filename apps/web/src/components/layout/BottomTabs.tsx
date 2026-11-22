import React, { useState, useEffect } from "react";
import { useUserStore } from "../../stores/useUserStore";
import { useAuthStore } from "../../stores/useAuthStore";
import { useMarketStore } from "../../stores/useMarketStore";
import { PositionsTable } from "../positions/PositionsTable";
import { OpenOrdersTable } from "../positions/OpenOrdersTable";

interface BottomTabsProps {
  onNavigateToPortfolio?: () => void;
}

export const BottomTabs: React.FC<BottomTabsProps> = ({ onNavigateToPortfolio }) => {
  const [activeTab, setActiveTab] = useState<"positions" | "orders">("positions");
  const { positions, openOrders, fetchLiveUser } = useUserStore();
  const { wallet, isAuthenticated, fetchWallet } = useAuthStore();
  const { markPrice, activeMarket } = useMarketStore();

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      fetchLiveUser();
      fetchWallet();
    }, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleTabChange = (tab: "positions" | "orders") => {
    setActiveTab(tab);
    if (isAuthenticated) {
      fetchLiveUser();
      fetchWallet();
    }
  };

  // Compute accurate financial breakdown across positions and orders
  const liveMarkNum = parseFloat(markPrice || "0");
  const positionMargin = positions.reduce((acc, pos) => acc + parseFloat(pos.margin || "0"), 0);

  const activeOpenOrders = openOrders.filter((o) => {
    if (o.status === "FILLED" || o.status === "CANCELLED") return false;
    const q = parseFloat(o.qty || "0");
    const f = parseFloat(o.filledQty || "0");
    if (q > 0 && f >= q) return false;
    return true;
  });

  const restingOrderMargin = activeOpenOrders.reduce((acc, o) => {
    if (o.reduceOnly) return acc;
    const remainingQty = Math.max(0, parseFloat(o.qty || "0") - parseFloat(o.filledQty || "0"));
    const price = parseFloat(o.price || "0");
    // Default 5x leverage if not specified
    const lev = 5;
    return acc + (remainingQty * price) / lev;
  }, 0);

  const walletLockedNum = parseFloat(wallet.amountLocked || "0");
  const orderMargin = Math.max(walletLockedNum, restingOrderMargin);

  // Total Locked Margin = Initial Margin committed to active positions + Margin held for resting limit orders
  const totalLockedMargin = positionMargin + orderMargin;

  // Total Unrealized PnL across active positions
  const totalUnrealizedPnl = positions.reduce((acc, pos) => {
    const entry = parseFloat(pos.entryPrice || "0");
    const size = parseFloat(pos.qty || "0");
    const mark = liveMarkNum > 0 ? liveMarkNum : entry;
    const pnl = pos.side === "LONG" ? (mark - entry) * size : (entry - mark) * size;
    return acc + pnl;
  }, 0);

  // Total Account Value = Available Collateral + Total Locked Initial Margin + Unrealized PnL
  const availableCollateral = parseFloat(wallet.amountAvail || "0");
  const totalAccountValue = availableCollateral + totalLockedMargin + totalUnrealizedPnl;
  const isPnlPositive = totalUnrealizedPnl >= 0;

  const activeMarketPositionsCount = positions.filter((pos) => {
    if (!activeMarket) return true;
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
  }).length;

  const activeMarketOrdersCount = activeOpenOrders.filter((order) => {
    if (!activeMarket) return true;
    const marketIdStr = String(order.marketId || "");
    const orderSymbol = (order.symbol || "").toUpperCase();
    const activeSymbol = (activeMarket.symbol || "").toUpperCase();
    return (
      marketIdStr === activeMarket.id ||
      orderSymbol === activeSymbol ||
      (orderSymbol.includes("BTC") && activeSymbol.includes("BTC"))
    );
  }).length;

  const activeOpenOrdersCount = activeOpenOrders.length;

  return (
    <div className="flex h-full flex-col bg-panel">
      {/* Tab Switcher Header */}
      <div className="shrink-0 flex h-9 items-center justify-between border-b border-borderDark px-3">
        <div className="flex items-center gap-4 text-xs font-semibold">
          <button
            onClick={() => handleTabChange("positions")}
            className={`flex items-center gap-1.5 pb-2 pt-2 border-b-2 transition ${
              activeTab === "positions"
                ? "border-accent text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>Positions</span>
            {activeMarketPositionsCount > 0 ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-white">
                {activeMarketPositionsCount}
              </span>
            ) : positions.length > 0 ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface text-[10px] text-slate-400">
                {positions.length}
              </span>
            ) : null}
          </button>

          <button
            onClick={() => handleTabChange("orders")}
            className={`flex items-center gap-1.5 pb-2 pt-2 border-b-2 transition ${
              activeTab === "orders"
                ? "border-accent text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>Open Orders</span>
            {activeMarketOrdersCount > 0 ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface text-[10px] text-slate-200">
                {activeMarketOrdersCount}
              </span>
            ) : activeOpenOrdersCount > 0 ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface text-[10px] text-slate-400">
                {activeOpenOrdersCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* Right Status Summary & Link to Portfolio */}
        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
          <div>
            <span>Equity: </span>
            <b className="text-white">${totalAccountValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
          </div>
          <div className="hidden sm:block h-3 w-px bg-borderDark" />
          <div className="hidden sm:block">
            <span>Avail: </span>
            <b className="text-emerald-400">${availableCollateral.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
          </div>
          <div className="h-3 w-px bg-borderDark" />
          <button
            onClick={onNavigateToPortfolio}
            className="text-accent hover:underline font-bold flex items-center gap-1"
          >
            <span>Portfolio & Balances</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "positions" && <PositionsTable />}
        {activeTab === "orders" && <OpenOrdersTable />}
      </div>
    </div>
  );
};
