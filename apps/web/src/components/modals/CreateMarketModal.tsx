import React, { useState, useEffect } from "react";
import { X, ShieldCheck, Key, Image, TrendingUp, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { marketService } from "../../services/api";
import { useMarketStore } from "../../stores/useMarketStore";
import { wsManager } from "../../services/websocket";

interface CreateMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_LOGOS: Record<string, string> = {
  BTC: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
  SOL: "https://cryptologos.cc/logos/solana-sol-logo.png",
  ETH: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
};

const DEFAULT_SPECS: Record<string, { tick: string; step: string }> = {
  BTC: { tick: "1", step: "0.001" },
  SOL: { tick: "0.1", step: "0.01" },
  ETH: { tick: "0.1", step: "0.001" },
};

export const CreateMarketModal: React.FC<CreateMarketModalProps> = ({ isOpen, onClose }) => {
  const [adminToken, setAdminToken] = useState("");
  const [showAdminToken, setShowAdminToken] = useState(false);
  const [rememberToken, setRememberToken] = useState(true);

  const [baseToken, setBaseToken] = useState<"BTC" | "SOL" | "ETH">("SOL");
  const [symbol, setSymbol] = useState("SOL_USDC");
  const [slug, setSlug] = useState("sol_usdc");
  const [tickSize, setTickSize] = useState("0.1");
  const [stepSize, setStepSize] = useState("0.01");
  const [imgUrl, setImgUrl] = useState(DEFAULT_LOGOS.SOL);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { fetchMarkets, setActiveMarket, markets } = useMarketStore();

  // Load saved admin token from local storage on modal open
  useEffect(() => {
    const saved = localStorage.getItem("perps_admin_token");
    if (saved) {
      setAdminToken(saved);
    }
  }, [isOpen]);

  // Handle base token switch
  const handleBaseTokenChange = (newBase: "BTC" | "SOL" | "ETH") => {
    setBaseToken(newBase);
    const specs = DEFAULT_SPECS[newBase];
    setTickSize(specs.tick);
    setStepSize(specs.step);
    setImgUrl(DEFAULT_LOGOS[newBase]);

    // Generate unique symbol if basic one already exists
    let candidateSymbol = `${newBase}_USDC`;
    let candidateSlug = `${newBase.toLowerCase()}_usdc`;
    if (markets.some((m) => m.symbol === candidateSymbol)) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      candidateSymbol = `${newBase}_PERP_${suffix}`;
      candidateSlug = `${newBase.toLowerCase()}_perp_${suffix}`;
    }
    setSymbol(candidateSymbol);
    setSlug(candidateSlug);
  };

  const handleSymbolChange = (val: string) => {
    const clean = val.toUpperCase().replace(/\s+/g, "_");
    setSymbol(clean);
    setSlug(clean.toLowerCase());
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const token = adminToken.trim();
    if (!token) {
      setError("Please provide an Admin Token to authorize market creation.");
      return;
    }

    setLoading(true);

    try {
      if (rememberToken) {
        localStorage.setItem("perps_admin_token", token);
      } else {
        localStorage.removeItem("perps_admin_token");
      }

      const res = await marketService.createMarket(
        {
          symbol: symbol.trim(),
          slug: slug.trim(),
          baseToken,
          imgUrl: imgUrl.trim() || DEFAULT_LOGOS[baseToken],
          tickSize: tickSize.trim(),
          stepSize: stepSize.trim(),
        },
        token
      );

      setSuccess(`Market ${symbol} created & initialized in matching engine!`);

      // Refresh markets and switch active market
      const updatedMarkets = await fetchMarkets();
      const newMarket = updatedMarkets.find((m) => m.symbol === symbol || m.id === res.id);
      if (newMarket) {
        setActiveMarket(newMarket);
        wsManager.switchSymbol(newMarket.symbol);
      }

      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 1200);
    } catch (err: any) {
      console.error("Create market failed:", err);
      if (err.response?.status === 403) {
        setError("Invalid Admin Token. Backend rejected authorization (default is 'admin123').");
      } else if (err.response?.status === 409) {
        setError(`Market '${symbol}' already exists. Choose a different symbol or slug.`);
      } else {
        setError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            "Failed to create market. Check parameters and backend status."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-borderDark bg-panel p-6 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white transition"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Add New Perpetual Market</h2>
            <p className="text-xs text-slate-400">
              Create and mount a new FIFO orderbook in the matching engine.
            </p>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Admin Token Section */}
          <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
            <label className="flex items-center justify-between text-xs font-semibold text-accent">
              <span className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" />
                Admin Secret Token (Authentication)
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                Matches ADMIN_SECRET
              </span>
            </label>
            <div className="relative mt-1.5">
              <input
                type={showAdminToken ? "text" : "password"}
                required
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="Enter admin token (e.g. admin123)"
                className="w-full rounded-md border border-borderDark bg-canvas px-3 py-2 pr-9 text-xs text-white placeholder-slate-500 focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowAdminToken(!showAdminToken)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
              >
                {showAdminToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="rememberAdmin"
                checked={rememberToken}
                onChange={(e) => setRememberToken(e.target.checked)}
                className="rounded border-borderDark bg-canvas text-accent focus:ring-0"
              />
              <label htmlFor="rememberAdmin" className="text-[11px] text-slate-400">
                Remember admin token on this browser
              </label>
            </div>
          </div>

          {/* Base Asset Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300">
              Base Token (Underlying)
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(["BTC", "SOL", "ETH"] as const).map((token) => (
                <button
                  type="button"
                  key={token}
                  onClick={() => handleBaseTokenChange(token)}
                  className={`flex items-center justify-center gap-2 rounded-lg border py-2 text-xs font-bold transition ${
                    baseToken === token
                      ? "border-accent bg-accent/15 text-white shadow-sm"
                      : "border-borderDark bg-canvas text-slate-400 hover:bg-surface hover:text-slate-200"
                  }`}
                >
                  <img
                    src={DEFAULT_LOGOS[token]}
                    alt={token}
                    className="h-4 w-4 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <span>{token}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Symbol & Slug */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Market Symbol
              </label>
              <input
                type="text"
                required
                value={symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                placeholder="SOL_USDC"
                className="mt-1 w-full rounded-md border border-borderDark bg-canvas px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300">
                Slug (URL Identifier)
              </label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="sol_usdc"
                className="mt-1 w-full rounded-md border border-borderDark bg-canvas px-3 py-2 text-xs font-mono text-slate-300 placeholder-slate-600 focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Tick Size & Step Size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Tick Size (Min Price)</span>
                <span className="text-[10px] text-slate-500">USD</span>
              </label>
              <input
                type="number"
                step="any"
                required
                value={tickSize}
                onChange={(e) => setTickSize(e.target.value)}
                placeholder="0.1"
                className="mt-1 w-full rounded-md border border-borderDark bg-canvas px-3 py-2 text-xs font-mono text-white focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Step Size (Min Qty)</span>
                <span className="text-[10px] text-slate-500">{baseToken}</span>
              </label>
              <input
                type="number"
                step="any"
                required
                value={stepSize}
                onChange={(e) => setStepSize(e.target.value)}
                placeholder="0.01"
                className="mt-1 w-full rounded-md border border-borderDark bg-canvas px-3 py-2 text-xs font-mono text-white focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Logo URL */}
          <div>
            <label className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1">
                <Image className="h-3 w-3 text-slate-400" />
                Icon URL
              </span>
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="url"
                required
                value={imgUrl}
                onChange={(e) => setImgUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 rounded-md border border-borderDark bg-canvas px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:border-accent focus:outline-none"
              />
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-borderDark bg-canvas">
                <img
                  src={imgUrl}
                  alt="preview"
                  className="h-5 w-5 rounded-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-xs font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-blue-600 disabled:opacity-50"
            >
              <TrendingUp className="h-4 w-4" />
              <span>{loading ? "Deploying Market to Engine..." : "Deploy Market"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
