import React, { useEffect, useState } from "react";
import { Header } from "./components/layout/Header";
import { TradingChart } from "./components/chart/TradingChart";
import { OrderbookLadder } from "./components/orderbook/OrderbookLadder";
import { TradeTape } from "./components/trades/TradeTape";
import { OrderEntry } from "./components/order/OrderEntry";
import { BottomTabs } from "./components/layout/BottomTabs";
import { useMarketStore } from "./stores/useMarketStore";
import { useAuthStore } from "./stores/useAuthStore";
import { useUserStore } from "./stores/useUserStore";
import { marketService } from "./services/api";
import { wsManager } from "./services/websocket";

export const App: React.FC = () => {
  const [middleTab, setMiddleTab] = useState<"book" | "trades">("book");
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);

  const { setMarkets, activeMarket } = useMarketStore();
  const { isAuthenticated, fetchWallet } = useAuthStore();
  const { fetchLiveUser } = useUserStore();

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
          const fallback = {
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
    <div className="flex h-screen w-screen flex-col bg-canvas text-slate-100 overflow-hidden font-sans">
      {/* Top Navbar */}
      <Header />

      {/* Main Terminal Layout */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Split: Chart + Orderbook/Trades + Order Entry */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Trading Chart Canvas */}
          <div className="flex-1 border-r border-borderDark min-w-0">
            <TradingChart />
          </div>

          {/* Center: Orderbook and Trade Tape with Tab Switcher */}
          <div className="w-80 flex flex-col border-r border-borderDark min-w-[320px]">
            {/* Center Switcher */}
            <div className="flex h-8 items-center border-b border-borderDark bg-panel px-2 text-xs">
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

            <div className="flex-1 overflow-hidden">
              {middleTab === "book" ? (
                <OrderbookLadder onSelectPrice={(p) => setSelectedPrice(p)} />
              ) : (
                <TradeTape />
              )}
            </div>
          </div>

          {/* Right: Order Entry Panel */}
          <div className="w-72 min-w-[280px]">
            <OrderEntry selectedPrice={selectedPrice} />
          </div>
        </div>

        {/* Bottom Section: Positions & Orders Management */}
        <div className="h-60 border-t border-borderDark">
          <BottomTabs />
        </div>
      </div>
    </div>
  );
};

export default App;
