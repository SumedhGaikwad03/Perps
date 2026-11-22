import React, { useState } from "react";
import {
  Wallet,
  Shield,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  PieChart,
  Layers,
  Clock,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useUserStore } from "../../stores/useUserStore";
import { useMarketStore } from "../../stores/useMarketStore";
import { orderService } from "../../services/api";
import { formatQty } from "../../utils/format";

interface PortfolioPageProps {
  onOpenDeposit: () => void;
  onNavigateToLive: (symbol?: string) => void;
}

export const PortfolioPage: React.FC<PortfolioPageProps> = ({
  onOpenDeposit,
  onNavigateToLive,
}) => {
  const { wallet, user, isAuthenticated, fetchWallet, openAuthModal } = useAuthStore();
  const { positions, openOrders, fetchLiveUser } = useUserStore();
  const { markets, markPrice, activeMarket } = useMarketStore();

  const [closingMarketId, setClosingMarketId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([fetchWallet(), fetchLiveUser()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClosePosition = async (pos: any) => {
    setClosingMarketId(pos.marketId);
    setActionError(null);
    try {
      const res = await orderService.exitPosition(pos.marketId, pos.qty);
      if (res?.result?.status === "CANCELLED" && (!res.result?.fills || res.result.fills.length === 0)) {
        setActionError("Close failed: No counterparty resting orders. Place a Limit order.");
      }
      await fetchLiveUser();
      await fetchWallet();
    } catch (err: any) {
      setActionError(err.response?.data?.message || err.message || "Failed to close position.");
    } finally {
      setClosingMarketId(null);
    }
  };

  const handleCancelOrder = async (order: any) => {
    setCancellingOrderId(order.orderId);
    try {
      await orderService.cancelOrder(order.orderId, order.marketId, order.side);
      await fetchLiveUser();
      await fetchWallet();
    } catch (e) {
      console.error("Failed to cancel order:", e);
    } finally {
      setCancellingOrderId(null);
    }
  };

  // 1. Position calculations
  const liveMarkNum = parseFloat(markPrice || "0");
  const positionMargin = positions.reduce((acc, pos) => acc + parseFloat(pos.margin || "0"), 0);

  let totalNotional = 0;
  let totalUnrealizedPnl = 0;

  positions.forEach((pos) => {
    const marketIdStr = String(pos.marketId || "");
    const marketObj = markets.find((m) => m.id === marketIdStr);
    const entry = parseFloat(pos.entryPrice || "0");
    const size = parseFloat(pos.qty || "0");
    const mMark = parseFloat(marketObj?.markPrice || marketObj?.lastTradedPrice || "0");
    const markToUse =
      activeMarket?.id === marketIdStr && liveMarkNum > 0
        ? liveMarkNum
        : mMark > 0
        ? mMark
        : entry;

    const pnl = pos.side === "LONG" ? (markToUse - entry) * size : (entry - markToUse) * size;
    totalUnrealizedPnl += pnl;
    totalNotional += Math.abs(size * markToUse);
  });

  // 2. Active open orders calculation
  const activeOpenOrders = openOrders.filter((o) => {
    if (o.status === "FILLED" || o.status === "CANCELLED") return false;
    const q = parseFloat(o.qty || "0");
    const f = parseFloat(o.filledQty || "0");
    return !(q > 0 && f >= q);
  });

  const restingOrderMargin = activeOpenOrders.reduce((acc, o) => {
    if (o.reduceOnly) return acc;
    const remainingQty = Math.max(0, parseFloat(o.qty || "0") - parseFloat(o.filledQty || "0"));
    const price = parseFloat(o.price || "0");
    const lev = 5;
    return acc + (remainingQty * price) / lev;
  }, 0);

  const walletLockedNum = parseFloat(wallet.amountLocked || "0");
  const orderMargin = Math.max(walletLockedNum, restingOrderMargin);

  // 3. Totals
  const totalLockedMargin = positionMargin + orderMargin;
  const availableCollateral = parseFloat(wallet.amountAvail || "0");
  const totalEquity = availableCollateral + totalLockedMargin + totalUnrealizedPnl;

  // 4. Risk & Margin Ratio
  const marginUsagePct = totalEquity > 0 ? Math.min(100, Math.max(0, (totalLockedMargin / totalEquity) * 100)) : 0;
  const maintenanceMargin = totalNotional * 0.03; // 3% MMR
  const liquidationBuffer = Math.max(0, totalEquity - maintenanceMargin);
  const effectiveLeverage = totalEquity > 0 ? (totalNotional / totalEquity).toFixed(2) : "0.00";

  const isProfitable = totalUnrealizedPnl >= 0;

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-canvas p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-panel border border-borderDark text-accent shadow-xl">
          <Wallet className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-white">Sign In to View Portfolio</h2>
        <p className="mt-1.5 max-w-md text-xs sm:text-sm text-slate-400">
          Connect your account to access real-time collateral balances, margin utilization, and active position metrics.
        </p>
        <button
          onClick={openAuthModal}
          className="mt-5 rounded-lg bg-accent px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-accent/20 hover:bg-blue-600 transition"
        >
          Connect / Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-canvas p-4 sm:p-6 lg:p-8 font-sans">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* Top Header & Fast Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Portfolio & Margin Account
              </h1>
              <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-mono text-slate-300">
                {user?.username}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Cross-margin collateral allocation, risk utilization, and real-time position health.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 rounded-lg border border-borderDark bg-panel px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-accent" : ""}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={onOpenDeposit}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white shadow-lg shadow-accent/20 hover:bg-blue-600 transition"
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>Deposit Collateral</span>
            </button>
          </div>
        </div>

        {actionError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-xs text-red-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="font-bold hover:text-white ml-2">✕</button>
          </div>
        )}

        {/* 1. Account Equity Hero Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-borderDark bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Total Account Equity</span>
              <PieChart className="h-4 w-4 text-accent" />
            </div>
            <div className="mt-2 text-2xl font-black text-white font-mono">
              ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-xs font-normal text-slate-400 ml-1">USDC</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Net balance across cash, margin & PnL
            </div>
          </div>

          <div className="rounded-xl border border-borderDark bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Available Free Margin</span>
              <Wallet className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-400 font-mono">
              ${availableCollateral.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Uncommitted collateral ready to trade
            </div>
          </div>

          <div className="rounded-xl border border-borderDark bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Total Locked Margin</span>
              <Layers className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-200 font-mono">
              ${totalLockedMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 font-mono">
              ${positionMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })} in pos · ${orderMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })} in orders
            </div>
          </div>

          <div className="rounded-xl border border-borderDark bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Total Unrealized PnL</span>
              <TrendingUp className={`h-4 w-4 ${isProfitable ? "text-bid" : "text-ask"}`} />
            </div>
            <div className={`mt-2 text-2xl font-black font-mono ${isProfitable ? "text-bid" : "text-ask"}`}>
              {isProfitable ? "+" : ""}${totalUnrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {positions.length} active position{positions.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {/* 2. Margin Risk & Account Health Gauge */}
        <div className="rounded-xl border border-borderDark bg-panel p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="h-4 w-4 text-accent" />
                <span>Account Margin Health & Risk Level</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Monitoring maintenance margin requirement (MMR 3%) vs account equity.
              </p>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <div>
                <span className="text-slate-400">Effective Leverage:</span>{" "}
                <b className="text-accent">{effectiveLeverage}x</b>
              </div>
              <div className="h-3 w-px bg-borderDark" />
              <div>
                <span className="text-slate-400">MMR Buffer:</span>{" "}
                <b className="text-emerald-400">${liquidationBuffer.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>
              </div>
            </div>
          </div>

          {/* Health Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Margin Utilization Ratio</span>
              <span className={`font-bold ${marginUsagePct > 80 ? "text-ask" : marginUsagePct > 50 ? "text-amber-400" : "text-emerald-400"}`}>
                {marginUsagePct.toFixed(1)}% {marginUsagePct > 80 ? "(High Risk)" : marginUsagePct > 50 ? "(Moderate)" : "(Safe)"}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-canvas border border-borderDark overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  marginUsagePct > 80
                    ? "bg-ask"
                    : marginUsagePct > 50
                    ? "bg-amber-400"
                    : "bg-emerald-400"
                }`}
                style={{ width: `${Math.max(2, marginUsagePct)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0% (Empty)</span>
              <span>50% (Recommended Target)</span>
              <span>80% (Warning)</span>
              <span>100% (Liquidation Threshold)</span>
            </div>
          </div>
        </div>

        {/* 3. Collateral Breakdown Table */}
        <div className="rounded-xl border border-borderDark bg-panel overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-borderDark bg-surface/40">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-accent" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">Collateral Assets</h2>
            </div>
            <button
              onClick={onOpenDeposit}
              className="text-xs text-accent hover:underline font-bold"
            >
              + Deposit USDC
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-borderDark text-[11px] uppercase tracking-wider text-slate-400 bg-surface/20">
                  <th className="py-2.5 px-4">Asset</th>
                  <th className="py-2.5 px-4">Total Balance</th>
                  <th className="py-2.5 px-4">Available (Free)</th>
                  <th className="py-2.5 px-4">Locked in Positions</th>
                  <th className="py-2.5 px-4">Locked in Orders</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderDark/40">
                <tr>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-xs">
                        $
                      </div>
                      <div>
                        <div className="font-bold text-white">USDC</div>
                        <div className="text-[10px] text-slate-400 font-sans">USD Coin (Settlement Asset)</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-bold text-white">
                    ${(availableCollateral + totalLockedMargin).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-emerald-400 font-bold">
                    ${availableCollateral.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    ${positionMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    ${orderMargin.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={onOpenDeposit}
                      className="rounded bg-accent/20 border border-accent/40 px-3 py-1 text-xs font-bold text-accent hover:bg-accent hover:text-white transition"
                    >
                      Deposit
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Active Positions Table (All Markets) */}
        <div className="rounded-xl border border-borderDark bg-panel overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-borderDark bg-surface/40">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-accent" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Active Open Positions ({positions.length})
              </h2>
            </div>
            <button
              onClick={() => onNavigateToLive()}
              className="text-xs text-accent hover:underline font-bold"
            >
              Open New Trade →
            </button>
          </div>

          <div className="overflow-x-auto">
            {positions.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 font-sans">
                No open positions currently held.
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-borderDark text-[11px] uppercase tracking-wider text-slate-400 bg-surface/20">
                    <th className="py-2.5 px-4">Market</th>
                    <th className="py-2.5 px-4">Side</th>
                    <th className="py-2.5 px-4">Size</th>
                    <th className="py-2.5 px-4">Entry Price</th>
                    <th className="py-2.5 px-4">Mark Price</th>
                    <th className="py-2.5 px-4">Liq Price</th>
                    <th className="py-2.5 px-4">Margin</th>
                    <th className="py-2.5 px-4">Unrealized PnL</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderDark/40">
                  {positions.map((pos, idx) => {
                    const marketIdStr = String(pos.marketId || "");
                    const marketObj = markets.find((m) => m.id === marketIdStr);
                    const symbol = marketObj?.symbol || pos.symbol || "BTC_USDC";
                    const isLong = pos.side === "LONG";
                    const entryNum = parseFloat(pos.entryPrice || "0");
                    const sizeNum = parseFloat(pos.qty || "0");
                    const marginNum = parseFloat(pos.margin || "1");
                    const levNum = parseFloat(pos.leverage || "1");

                    const mMark = parseFloat(marketObj?.markPrice || marketObj?.lastTradedPrice || "0");
                    const markToUse =
                      activeMarket?.id === marketIdStr && liveMarkNum > 0
                        ? liveMarkNum
                        : mMark > 0
                        ? mMark
                        : entryNum;

                    const pnl = isLong ? (markToUse - entryNum) * sizeNum : (entryNum - markToUse) * sizeNum;
                    const roe = marginNum > 0 ? (pnl / marginNum) * 100 : 0;
                    const isPosProfitable = pnl >= 0;

                    const mmr = 0.03;
                    const estLiqPrice =
                      entryNum > 0 && levNum > 0
                        ? isLong
                          ? Math.max(0, entryNum * (1 - 1 / levNum + mmr))
                          : entryNum * (1 + 1 / levNum - mmr)
                        : 0;

                    const finalLiq = pos.liquidationPrice && parseFloat(pos.liquidationPrice) > 0
                      ? parseFloat(pos.liquidationPrice)
                      : estLiqPrice;

                    const isClosing = closingMarketId === pos.marketId;

                    return (
                      <tr key={pos.marketId || idx} className="hover:bg-surface/50">
                        <td className="py-3 px-4 font-bold text-white">
                          <button
                            onClick={() => onNavigateToLive(symbol)}
                            className="hover:text-accent hover:underline flex items-center gap-1"
                          >
                            <span>{symbol}</span>
                            <ArrowUpRight className="h-3 w-3 text-slate-500" />
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isLong ? "bg-bid/10 text-bid" : "bg-ask/10 text-ask"
                            }`}
                          >
                            {pos.side} {pos.leverage}x
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-200">
                          {formatQty(pos.qty, marketObj?.stepSize)}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          ${entryNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          ${markToUse.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-ask font-semibold">
                          ${finalLiq.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          ${marginNum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`py-3 px-4 font-bold ${isPosProfitable ? "text-bid" : "text-ask"}`}>
                          {isPosProfitable ? "+" : ""}${pnl.toFixed(2)} ({isPosProfitable ? "+" : ""}{roe.toFixed(2)}%)
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            disabled={isClosing}
                            onClick={() => handleClosePosition(pos)}
                            className="rounded border border-ask/40 bg-ask/10 px-2.5 py-1 text-[11px] font-semibold text-ask hover:bg-ask hover:text-white transition disabled:opacity-50"
                          >
                            {isClosing ? "Closing..." : "Close"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 5. Resting Limit Orders Table */}
        <div className="rounded-xl border border-borderDark bg-panel overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-borderDark bg-surface/40">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-accent" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Resting Limit Orders & Margin Locked ({activeOpenOrders.length})
              </h2>
            </div>
            {activeOpenOrders.length > 0 && (
              <span className="text-xs font-mono text-slate-400">
                Total Margin Held: ${orderMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            {activeOpenOrders.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 font-sans">
                No active resting limit orders.
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-borderDark text-[11px] uppercase tracking-wider text-slate-400 bg-surface/20">
                    <th className="py-2.5 px-4">Order ID</th>
                    <th className="py-2.5 px-4">Market</th>
                    <th className="py-2.5 px-4">Side</th>
                    <th className="py-2.5 px-4">Price</th>
                    <th className="py-2.5 px-4">Quantity</th>
                    <th className="py-2.5 px-4">Filled</th>
                    <th className="py-2.5 px-4">Locked Margin</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderDark/40">
                  {activeOpenOrders.map((order, idx) => {
                    const orderIdStr = String(order.orderId || "");
                    const marketIdStr = String(order.marketId || "");
                    const marketObj = markets.find((m) => m.id === marketIdStr);
                    const symbol = marketObj?.symbol || "BTC_USDC";
                    const isBuy = order.side === "BID";
                    const priceNum = parseFloat(order.price || "0");
                    const remQty = Math.max(0, parseFloat(order.qty || "0") - parseFloat(order.filledQty || "0"));
                    const heldMargin = order.reduceOnly ? 0 : (remQty * priceNum) / 5;
                    const isCancelling = cancellingOrderId === orderIdStr;

                    return (
                      <tr key={orderIdStr || idx} className="hover:bg-surface/50">
                        <td className="py-3 px-4 text-slate-400">
                          {orderIdStr ? `${orderIdStr.slice(0, 8)}...` : "—"}
                        </td>
                        <td className="py-3 px-4 font-bold text-white">{symbol}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isBuy ? "bg-bid/10 text-bid" : "bg-ask/10 text-ask"
                            }`}
                          >
                            {isBuy ? "BUY" : "SELL"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-200">${priceNum.toLocaleString()}</td>
                        <td className="py-3 px-4 text-slate-300">{formatQty(order.qty, marketObj?.stepSize)}</td>
                        <td className="py-3 px-4 text-slate-400">{formatQty(order.filledQty, marketObj?.stepSize)}</td>
                        <td className="py-3 px-4 text-slate-300 font-semibold">
                          ${heldMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {order.reduceOnly && " (RO)"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            disabled={isCancelling}
                            onClick={() => handleCancelOrder(order)}
                            className="rounded border border-slate-600 bg-surface px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-ask hover:bg-ask hover:text-white transition disabled:opacity-50"
                          >
                            {isCancelling ? "Cancelling..." : "Cancel"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
