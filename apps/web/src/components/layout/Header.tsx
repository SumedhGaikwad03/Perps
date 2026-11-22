import React, { useState, useEffect } from "react";
import { ChevronDown, Plus, LogOut, Wallet, User as UserIcon, PlusCircle } from "lucide-react";
import { useMarketStore } from "../../stores/useMarketStore";
import { useAuthStore } from "../../stores/useAuthStore";
import { wsManager } from "../../services/websocket";
import { AuthModal } from "../modals/AuthModal";
import { DepositModal } from "../modals/DepositModal";
import { CreateMarketModal } from "../modals/CreateMarketModal";

export const Header: React.FC = () => {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isCreateMarketOpen, setIsCreateMarketOpen] = useState(false);
  const [isMarketDropdownOpen, setIsMarketDropdownOpen] = useState(false);

  // Dynamic Funding Rate Countdown Timer
  const [countdown, setCountdown] = useState("00:00:00");
  const [fundingRate, setFundingRate] = useState("+0.0100%");

  const { markets, activeMarket, setActiveMarket, markPrice } = useMarketStore();
  const { user, wallet, isAuthenticated, logout } = useAuthStore();

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      // Calculate remaining time until next top of the hour
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);
      const diffMs = Math.max(0, nextHour.getTime() - now.getTime());

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      setCountdown(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );

      // Compute dynamic funding rate from mark price vs last traded price if available
      const markNum = parseFloat(markPrice || "0");
      const lastNum = parseFloat(activeMarket?.lastTradedPrice || "0");
      if (markNum > 0 && lastNum > 0) {
        const premium = (lastNum - markNum) / markNum;
        const clamped = Math.min(Math.max(premium, -0.0005), 0.0005);
        const pct = (clamped * 100).toFixed(4);
        setFundingRate(`${clamped >= 0 ? "+" : ""}${pct}%`);
      } else {
        setFundingRate("+0.0100%");
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [markPrice, activeMarket?.lastTradedPrice]);

  const handleSelectMarket = (m: any) => {
    setActiveMarket(m);
    setIsMarketDropdownOpen(false);
    wsManager.switchSymbol(m.symbol);
  };

  const currentPrice = markPrice && parseFloat(markPrice) > 0
    ? markPrice
    : activeMarket?.markPrice || activeMarket?.lastTradedPrice || "89,000.00";

  const priceChange = activeMarket?.priceChangePercent24h || "+2.45%";
  const isPositive = !priceChange.startsWith("-");

  return (
    <>
      <header className="flex h-12 w-full shrink-0 items-center justify-between border-b border-borderDark bg-panel px-3 sm:px-4">
        {/* Left: Brand + Market Selector + Key Stats */}
        <div className="flex items-center gap-3 lg:gap-5 min-w-0">
          {/* Brand Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="h-2.5 w-2.5 rounded-full bg-bid animate-pulse shadow-sm shadow-bid" />
            <span className="text-base font-extrabold tracking-wider text-white">PERPS</span>
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent">
              MVP
            </span>
          </div>

          <div className="h-4 w-px bg-borderDark shrink-0" />

          {/* Market Dropdown + Add Market Button */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <button
                onClick={() => setIsMarketDropdownOpen(!isMarketDropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-borderDark bg-canvas px-2.5 py-1 text-sm font-bold text-white hover:border-slate-500"
              >
                <span>{activeMarket?.symbol || "BTC_USDC"}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {isMarketDropdownOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-borderDark bg-panel p-1.5 shadow-2xl">
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <span>Perpetual Markets</span>
                    <span className="text-[9px] text-slate-500">{markets.length} active</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {markets.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleSelectMarket(m)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition ${
                          activeMarket?.id === m.id
                            ? "bg-accent/20 text-white font-bold"
                            : "text-slate-200 hover:bg-surface"
                        }`}
                      >
                        <span className="font-bold">{m.symbol}</span>
                        <span className="font-mono text-slate-400">
                          ${parseFloat(m.markPrice || m.lastTradedPrice || "0").toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 border-t border-borderDark/60 pt-1">
                    <button
                      onClick={() => {
                        setIsMarketDropdownOpen(false);
                        setIsCreateMarketOpen(true);
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent/10 px-2 py-1.5 text-xs font-semibold text-accent hover:bg-accent hover:text-white transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add New Market</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Add Market Button */}
            <button
              onClick={() => setIsCreateMarketOpen(true)}
              title="Add New Perpetual Market"
              className="flex items-center gap-1 rounded-lg border border-borderDark bg-canvas px-2 py-1 text-xs font-semibold text-slate-300 hover:border-accent hover:text-accent transition"
            >
              <PlusCircle className="h-3.5 w-3.5 text-accent" />
              <span className="hidden sm:inline">Add Market</span>
            </button>
          </div>

          {/* Real-time Ticker Metrics */}
          <div className="hidden items-center gap-4 lg:gap-5 text-xs md:flex min-w-0">
            <div className="shrink-0">
              <div className="text-[10px] text-slate-400">Mark Price</div>
              <div className={`font-mono font-bold ${isPositive ? "text-bid" : "text-ask"}`}>
                ${parseFloat(currentPrice).toLocaleString()}
              </div>
            </div>

            <div className="shrink-0">
              <div className="text-[10px] text-slate-400">24h Change</div>
              <div className={`font-mono font-medium ${isPositive ? "text-bid" : "text-ask"}`}>
                {priceChange}
              </div>
            </div>

            <div className="hidden xl:block shrink-0">
              <div className="text-[10px] text-slate-400">24h High</div>
              <div className="font-mono text-slate-200">
                ${parseFloat(activeMarket?.high24h || "89500").toLocaleString()}
              </div>
            </div>

            <div className="hidden xl:block shrink-0">
              <div className="text-[10px] text-slate-400">24h Low</div>
              <div className="font-mono text-slate-200">
                ${parseFloat(activeMarket?.low24h || "87200").toLocaleString()}
              </div>
            </div>

            <div className="hidden lg:block shrink-0">
              <div className="text-[10px] text-slate-400">Funding / Countdown</div>
              <div className="font-mono text-accent">{fundingRate} / {countdown}</div>
            </div>
          </div>
        </div>

        {/* Right: Auth, Wallet, and On-Ramp */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isAuthenticated ? (
            <>
              {/* Collateral Balance Pill */}
              <div className="flex items-center gap-2 rounded-lg border border-borderDark bg-canvas px-3 py-1 text-xs">
                <Wallet className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-slate-400">Avail:</span>
                <span className="font-mono font-bold text-white">
                  ${parseFloat(wallet.amountAvail || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <button
                  onClick={() => setIsDepositOpen(true)}
                  title="Deposit Collateral"
                  className="flex h-5 w-5 items-center justify-center rounded bg-accent/20 text-accent transition hover:bg-accent hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* User Dropdown / Logout */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  {user?.username}
                </span>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="rounded p-1.5 text-slate-400 transition hover:bg-surface hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-accent/20 transition hover:bg-blue-600"
            >
              <UserIcon className="h-3.5 w-3.5" />
              <span>Connect / Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Modals */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <DepositModal isOpen={isDepositOpen} onClose={() => setIsDepositOpen(false)} />
      <CreateMarketModal isOpen={isCreateMarketOpen} onClose={() => setIsCreateMarketOpen(false)} />
    </>
  );
};
