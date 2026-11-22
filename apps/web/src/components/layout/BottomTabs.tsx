import React, { useState } from "react";
import { useUserStore } from "../../stores/useUserStore";
import { useAuthStore } from "../../stores/useAuthStore";
import { PositionsTable } from "../positions/PositionsTable";
import { OpenOrdersTable } from "../positions/OpenOrdersTable";

export const BottomTabs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"positions" | "orders" | "balances">("positions");
  const { positions, openOrders, fetchLiveUser } = useUserStore();
  const { wallet, isAuthenticated, fetchWallet } = useAuthStore();

  const handleTabChange = (tab: "positions" | "orders" | "balances") => {
    setActiveTab(tab);
    if (isAuthenticated) {
      fetchLiveUser();
      fetchWallet();
    }
  };

  return (
    <div className="flex h-full flex-col bg-panel border-t border-borderDark">
      {/* Tab Switcher Header */}
      <div className="flex h-9 items-center justify-between border-b border-borderDark px-3">
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
            {positions.length > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-white">
                {positions.length}
              </span>
            )}
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
            {openOrders.length > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface text-[10px] text-slate-300">
                {openOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange("balances")}
            className={`pb-2 pt-2 border-b-2 transition ${
              activeTab === "balances"
                ? "border-accent text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Margin & Balances
          </button>
        </div>

        <div className="font-mono text-[11px] text-slate-400">
          Equity: ${parseFloat(wallet.amountAvail || "0").toLocaleString()} USDC
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "positions" && <PositionsTable />}
        {activeTab === "orders" && <OpenOrdersTable />}
        {activeTab === "balances" && (
          <div className="grid grid-cols-3 gap-4 p-4 font-mono text-xs">
            <div className="rounded-lg bg-canvas p-3 border border-borderDark">
              <span className="text-slate-400">Available Collateral</span>
              <p className="mt-1 text-lg font-bold text-white">
                ${parseFloat(wallet.amountAvail || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg bg-canvas p-3 border border-borderDark">
              <span className="text-slate-400">Locked Initial Margin</span>
              <p className="mt-1 text-lg font-bold text-slate-300">
                ${parseFloat(wallet.amountLocked || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg bg-canvas p-3 border border-borderDark">
              <span className="text-slate-400">Total Account Value</span>
              <p className="mt-1 text-lg font-bold text-bid">
                ${(parseFloat(wallet.amountAvail || "0") + parseFloat(wallet.amountLocked || "0")).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
