import React, { useState } from "react";
import { X, ArrowDownCircle, CheckCircle2 } from "lucide-react";
import { walletService } from "../../services/api";
import { useAuthStore } from "../../stores/useAuthStore";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_AMOUNTS = ["1000", "5000", "25000", "100000"];

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose }) => {
  const [amount, setAmount] = useState("10000");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useAuthStore((s) => s.fetchWallet);

  if (!isOpen) return null;

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please specify a valid deposit amount.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await walletService.deposit(amount);
      await fetchWallet();
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to process collateral deposit.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-borderDark bg-panel p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <ArrowDownCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Deposit Collateral (USDC)</h2>
            <p className="text-xs text-slate-400">On-ramp test margin funds directly into your account</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {success ? (
          <div className="my-8 flex flex-col items-center justify-center text-center">
            <CheckCircle2 className="h-12 w-12 text-bid animate-bounce" />
            <p className="mt-3 text-sm font-semibold text-white">Deposit Successful!</p>
            <p className="text-xs text-slate-400">+${parseFloat(amount).toLocaleString()} USDC added to margin</p>
          </div>
        ) : (
          <form onSubmit={handleDeposit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300">Amount (USDC)</label>
              <div className="relative mt-1">
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-borderDark bg-canvas py-2.5 pl-3 pr-16 text-base font-mono font-semibold text-white focus:border-accent focus:outline-none"
                />
                <span className="absolute right-3 top-2.5 text-xs font-semibold text-slate-400">
                  USDC
                </span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={`rounded-lg border py-1.5 text-xs font-mono font-medium transition ${
                    amount === preset
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-borderDark bg-surface text-slate-300 hover:border-slate-500"
                  }`}
                >
                  +${parseInt(preset).toLocaleString()}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-bid py-2.5 text-sm font-semibold text-black shadow-lg shadow-bid/20 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Confirming On-Ramp..." : "Deposit Collateral"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
