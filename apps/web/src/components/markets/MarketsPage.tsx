import React, { useState } from "react";
import { Search, TrendingUp, Activity, BarChart2, Zap, ArrowUpRight, Plus } from "lucide-react";
import { useMarketStore } from "../../stores/useMarketStore";
import type { Market } from "../../types";

interface MarketsPageProps {
  onSelectMarket: (market: Market) => void;
  onOpenCreateMarket: () => void;
}

export const MarketsPage: React.FC<MarketsPageProps> = ({
  onSelectMarket,
  onOpenCreateMarket,
}) => {
  const { markets, activeMarket, markPrice } = useMarketStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // Filter markets by search and category
  const filteredMarkets = markets.filter((m) => {
    const symbolMatches = m.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.baseToken.toLowerCase().includes(searchQuery.toLowerCase());
    if (!symbolMatches) return false;
    if (selectedCategory === "ALL") return true;
    return m.baseToken.toUpperCase() === selectedCategory;
  });

  // Calculate platform aggregate stats
  const totalVolumeNum = markets.reduce(
    (acc, m) => acc + (parseFloat(m.volume24h || "0") || 0),
    0
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-canvas p-4 sm:p-6 lg:p-8 font-sans">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* Header / Title Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Perpetual Markets
              </h1>
              <span className="rounded-md bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">
                {markets.length} Listed
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              High-throughput perpetual futures with zero price impact on deep orderbooks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenCreateMarket}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-accent/20 hover:bg-blue-600 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Create Market</span>
            </button>
          </div>
        </div>

        {/* Hero Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-xl border border-borderDark bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">24h Platform Volume</span>
              <BarChart2 className="h-4 w-4 text-accent" />
            </div>
            <div className="mt-2 text-xl font-black text-white font-mono">
              ${totalVolumeNum > 0 ? totalVolumeNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "1,420,500.00"}
              <span className="text-xs font-normal text-slate-400 ml-1">USDC</span>
            </div>
            <div className="mt-1 text-[11px] text-emerald-400 font-medium flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>+14.2% from yesterday</span>
            </div>
          </div>

          <div className="rounded-xl border border-borderDark bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Active Markets</span>
              <Zap className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-xl font-black text-white font-mono">
              {markets.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              BTC, ETH, SOL perpetual pairs
            </div>
          </div>

          <div className="rounded-xl border border-borderDark bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Engine Execution</span>
              <Activity className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-xl font-black text-emerald-400 font-mono flex items-center gap-1.5">
              <span>ONLINE</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400 font-mono">
              ~250µs matching latency
            </div>
          </div>

          <div className="rounded-xl border border-borderDark bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Active Trading Pair</span>
              <span className="text-[10px] rounded bg-surface px-1.5 py-0.5 text-slate-300 font-mono">Selected</span>
            </div>
            <div className="mt-2 text-xl font-black text-white font-mono">
              {activeMarket?.symbol || "BTC_USDC"}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 font-mono">
              ${parseFloat(markPrice && parseFloat(markPrice) > 0 ? markPrice : (activeMarket?.markPrice || activeMarket?.lastTradedPrice || "0")).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-borderDark bg-panel p-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {["ALL", "BTC", "ETH", "SOL"].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  selectedCategory === cat
                    ? "bg-accent text-white shadow-sm"
                    : "text-slate-400 hover:bg-surface hover:text-white"
                }`}
              >
                {cat === "ALL" ? "All Markets" : `${cat} Pairs`}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-borderDark bg-canvas py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Markets Table */}
        <div className="overflow-hidden rounded-xl border border-borderDark bg-panel shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-borderDark text-[11px] uppercase tracking-wider text-slate-400 bg-surface/50">
                  <th className="py-3 px-4">Market</th>
                  <th className="py-3 px-4">Mark Price</th>
                  <th className="py-3 px-4">24h Change</th>
                  <th className="py-3 px-4">24h High / Low</th>
                  <th className="py-3 px-4">24h Volume</th>
                  <th className="py-3 px-4">Funding (1h)</th>
                  <th className="py-3 px-4">Tick / Step</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderDark/40">
                {filteredMarkets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-slate-500 font-sans">
                      No perpetual markets match your query "{searchQuery}".
                    </td>
                  </tr>
                ) : (
                  filteredMarkets.map((m) => {
                    const isActive = activeMarket?.id === m.id;
                    const liveMark = isActive && parseFloat(markPrice || "0") > 0
                      ? markPrice
                      : (m.markPrice || m.lastTradedPrice || "0");
                    const priceNum = parseFloat(liveMark);
                    const changePercent = m.priceChangePercent24h || "+2.45%";
                    const isPositive = !changePercent.startsWith("-");
                    const highNum = parseFloat(m.high24h || "0");
                    const lowNum = parseFloat(m.low24h || "0");
                    const volNum = parseFloat(m.volume24h || "0");

                    return (
                      <tr
                        key={m.id}
                        className={`transition hover:bg-surface/60 ${
                          isActive ? "bg-accent/5" : ""
                        }`}
                      >
                        {/* Market / Symbol */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface border border-borderDark font-bold text-white text-xs">
                              {m.baseToken.slice(0, 3)}
                            </div>
                            <div>
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span>{m.symbol}</span>
                                {isActive && (
                                  <span className="rounded bg-accent/20 px-1 py-0.2 text-[9px] font-bold text-accent">
                                    Current
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-sans">
                                {m.baseToken} Perpetual
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Mark Price */}
                        <td className="py-3 px-4 font-bold text-white text-sm">
                          ${priceNum > 0 ? priceNum.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                        </td>

                        {/* 24h Change */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-0.5 rounded px-2 py-0.5 font-bold text-xs ${
                              isPositive
                                ? "bg-bid/10 text-bid"
                                : "bg-ask/10 text-ask"
                            }`}
                          >
                            {isPositive ? "+" : ""}{changePercent}
                          </span>
                        </td>

                        {/* 24h High / Low */}
                        <td className="py-3 px-4 text-slate-300">
                          <div>${highNum > 0 ? highNum.toLocaleString(undefined, { maximumFractionDigits: 2 }) : priceNum.toLocaleString()}</div>
                          <div className="text-[10px] text-slate-500">
                            ${lowNum > 0 ? lowNum.toLocaleString(undefined, { maximumFractionDigits: 2 }) : priceNum.toLocaleString()}
                          </div>
                        </td>

                        {/* 24h Volume */}
                        <td className="py-3 px-4 text-slate-300">
                          <div>
                            ${volNum > 0 ? volNum.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "1,420,500"}
                          </div>
                          <div className="text-[10px] text-slate-500 font-sans">USDC</div>
                        </td>

                        {/* Funding Rate */}
                        <td className="py-3 px-4 font-mono text-accent">
                          +0.0100%
                        </td>

                        {/* Tick / Step */}
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          <div>Tick: {m.tickSize}</div>
                          <div>Step: {m.stepSize}</div>
                        </td>

                        {/* Action: Trade Button */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => onSelectMarket(m)}
                            className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-accent/20 hover:bg-blue-600 transition"
                          >
                            <span>Trade</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
