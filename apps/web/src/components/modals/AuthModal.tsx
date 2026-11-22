import React, { useState } from "react";
import { X, Lock, User as UserIcon } from "lucide-react";
import { authService } from "../../services/api";
import { useAuthStore } from "../../stores/useAuthStore";
import { wsManager } from "../../services/websocket";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useAuthStore((s) => s.login);
  const fetchWallet = useAuthStore((s) => s.fetchWallet);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        // Register user then sign in automatically
        const signupRes = await authService.signup(username, password);
        const signinRes = await authService.signin(username, password);
        login({
          id: signupRes.id || signinRes.id || "",
          username,
          token: signinRes.token,
        });
      } else {
        const signinRes = await authService.signin(username, password);
        login({
          id: signinRes.id || "",
          username,
          token: signinRes.token,
        });
      }

      await fetchWallet();
      wsManager.connect();
      onClose();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Authentication failed. Please verify credentials."
      );
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

        <h2 className="text-xl font-bold text-white">
          {isSignUp ? "Create Trading Account" : "Sign In to Terminal"}
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Connect your account to access real-time order placement & margin trading.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300">
              Username
            </label>
            <div className="relative mt-1">
              <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="trader_01"
                className="w-full rounded-lg border border-borderDark bg-canvas py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-borderDark bg-canvas py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? "Processing..." : isSignUp ? "Sign Up & Trade" : "Sign In"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-slate-400">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="font-medium text-accent hover:underline"
          >
            {isSignUp ? "Sign In" : "Create one"}
          </button>
        </div>
      </div>
    </div>
  );
};
