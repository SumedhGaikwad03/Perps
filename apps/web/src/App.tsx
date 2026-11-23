import React, { useEffect, useState } from "react";
import { Header } from "./components/layout/Header";
import { TradingChart } from "./components/chart/TradingChart";
import { OrderbookLadder } from "./components/orderbook/OrderbookLadder";
import { TradeTape } from "./components/trades/TradeTape";
import { OrderEntry } from "./components/order/OrderEntry";
import { BottomTabs } from "./components/layout/BottomTabs";
import { MarketsPage } from "./components/markets/MarketsPage";
import { PortfolioPage } from "./components/portfolio/PortfolioPage";
import { CreateMarketModal } from "./components/modals/CreateMarketModal";
import { DepositModal } from "./components/modals/DepositModal";
import { WithdrawModal } from "./components/modals/WithdrawModal";
import { useMarketStore } from "./stores/useMarketStore";
import { useAuthStore } from "./stores/useAuthStore";
import { useUserStore } from "./stores/useUserStore";
import { marketService } from "./services/api";
import { wsManager } from "./services/websocket";
import type { Market } from "./types";

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<"live" | "markets" | "portfolio">(() => {
    if (typeof window !== "undefined") {
      const p = window.location.pathname.toLowerCase();
      if (p.startsWith("/markets")) return "markets";
      if (p.startsWith("/portfolio") || p.startsWith("/balances")) return "portfolio";
    }
    return "live";
  });
  const [middleTab, setMiddleTab] = useState<"book" | "trades">("book");
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);
  const [isCreateMarketOpen, setIsCreateMarketOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);

  const { setMarkets, activeMarket, setActiveMarket, markets } = useMarketStore();
  const { isAuthenticated, fetchWallet } = useAuthStore();
  const { fetchLiveUser } = useUserStore();

  const handleNavigate = (page: "live" | "markets" | "portfolio", symbol?: string) => {
    setCurrentPage(page);
    const targetUrl =
      page === "markets"
        ? "/markets"
        : page === "portfolio"
        ? "/portfolio"
        : symbol
        ? `/live?market=${symbol}`
        : "/live";

    if (typeof window !== "undefined") {
      window.history.pushState({}, "", targetUrl);
    }
    if (symbol) {
      const target = markets.find((m) => m.symbol === symbol || m.id === symbol);
      if (target) {
        setActiveMarket(target);
        wsManager.switchSymbol(target.symbol);
      }
    }
  };

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname.toLowerCase();
      if (p.startsWith("/markets")) {
        setCurrentPage("markets");
      } else if (p.startsWith("/portfolio") || p.startsWith("/balances")) {
        setCurrentPage("portfolio");
      } else {
        setCurrentPage("live");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleSelectMarketFromMarketsPage = (m: Market) => {
    setActiveMarket(m);
    wsManager.switchSymbol(m.symbol);
    handleNavigate("live", m.symbol);
  };

  // Initial Bootstrapping
  useEffect(() => {
    async function init() {
      try {
        const marketsData = await marketService.getMarkets();
        if (marketsData && Array.isArray(marketsData) && marketsData.length > 0) {
          setMarkets(marketsData);
          wsManager.connect(marketsData[0].symbol);
        } else {
          // Fallback market if database has not seeded yet
          const fallback: Market = {
            id: "btc-usdc",
            symbol: "BTC_USDC",
            slug: "btc_usdc",
            baseToken: "BTC",
            tickSize: "1",
            stepSize: "0.001",
            lastTradedPrice: "89000.00",
            markPrice: "89000.00",
          };
          setMarkets([fallback]);
          wsManager.connect(fallback.symbol);
        }

        if (isAuthenticated) {
          fetchWallet();
          fetchLiveUser();
        }
      } catch (err) {
        console.warn("Could not load markets from API, connecting WS fallback:", err);
        wsManager.connect("BTC_USDC");
      }
    }

    init();

    return () => {
      wsManager.disconnect();
    };
  }, [isAuthenticated]);

  return (
    <div className="flex h-screen w-screen flex-col bg-canvas text-slate-100 overflow-x-auto overflow-y-hidden font-sans">
      {/* Top Navbar */}
      <Header
        activePage={currentPage}
        onNavigate={handleNavigate}
        onOpenCreateMarket={() => setIsCreateMarketOpen(true)}
        onOpenDeposit={() => setIsDepositOpen(true)}
        onOpenWithdraw={() => setIsWithdrawOpen(true)}
      />

      {/* Main Page Content Area */}
      {currentPage === "markets" ? (
        <MarketsPage
          onSelectMarket={handleSelectMarketFromMarketsPage}
          onOpenCreateMarket={() => setIsCreateMarketOpen(true)}
        />
      ) : currentPage === "portfolio" ? (
        <PortfolioPage
          onOpenDeposit={() => setIsDepositOpen(true)}
          onOpenWithdraw={() => setIsWithdrawOpen(true)}
          onNavigateToLive={(sym) => handleNavigate("live", sym)}
        />
      ) : (
        /* Live Trading Terminal Layout */
        <div className="flex flex-1 flex-col overflow-hidden min-h-0 min-w-[960px]">
          {/* Top Split: Chart + Orderbook/Trades + Order Entry */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: Trading Chart Canvas */}
            <div className="flex-1 min-w-[360px] min-h-0 relative border-r border-borderDark flex flex-col overflow-hidden">
              <TradingChart />
            </div>

            {/* Center: Orderbook and Trade Tape with Tab Switcher */}
            <div className="w-80 shrink-0 min-w-[300px] min-h-0 flex flex-col border-r border-borderDark overflow-hidden bg-panel">
              {/* Center Switcher */}
              <div className="shrink-0 flex h-8 items-center border-b border-borderDark bg-panel px-2 text-xs">
                <button
                  onClick={() => setMiddleTab("book")}
                  className={`flex-1 py-1 text-center font-semibold transition ${
                    middleTab === "book"
                      ? "border-b-2 border-accent text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Order Book
                </button>
                <button
                  onClick={() => setMiddleTab("trades")}
                  className={`flex-1 py-1 text-center font-semibold transition ${
                    middleTab === "trades"
                      ? "border-b-2 border-accent text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Recent Trades
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {middleTab === "book" ? (
                  <OrderbookLadder onSelectPrice={(p) => setSelectedPrice(p)} />
                ) : (
                  <TradeTape />
                )}
              </div>
            </div>

            {/* Right: Order Entry Panel */}
            <div className="w-72 md:w-80 shrink-0 min-w-[280px] min-h-0 flex flex-col overflow-hidden bg-panel">
              <OrderEntry selectedPrice={selectedPrice} />
            </div>
          </div>

          {/* Bottom Section: Positions & Orders Management */}
          <div className="h-56 md:h-60 shrink-0 min-h-[160px] flex flex-col overflow-hidden border-t border-borderDark">
            <BottomTabs onNavigateToPortfolio={() => handleNavigate("portfolio")} />
          </div>
        </div>
      )}

      {/* Global Modals */}
      <CreateMarketModal
        isOpen={isCreateMarketOpen}
        onClose={() => setIsCreateMarketOpen(false)}
      />
      <DepositModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
      />
      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
      />
    </div>
  );
};

export default App;
