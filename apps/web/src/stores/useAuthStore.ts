import { create } from "zustand";
import type { UserProfile, UserWallet } from "../types";
import { userService } from "../services/api";

interface AuthState {
  user: UserProfile | null;
  wallet: UserWallet;
  isAuthenticated: boolean;
  login: (user: UserProfile) => void;
  logout: () => void;
  fetchWallet: () => Promise<void>;
  setWallet: (wallet: UserWallet) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // restore from localStorage if exists
  const savedToken = localStorage.getItem("perps_token");
  const savedUser = localStorage.getItem("perps_user");
  const initialUser = savedUser ? JSON.parse(savedUser) : null;

  return {
    user: initialUser,
    wallet: { amountAvail: "0", amountLocked: "0" },
    isAuthenticated: !!savedToken,

    login: (user: UserProfile) => {
      localStorage.setItem("perps_token", user.token);
      localStorage.setItem("perps_user", JSON.stringify(user));
      set({ user, isAuthenticated: true });
    },

    logout: () => {
      localStorage.removeItem("perps_token");
      localStorage.removeItem("perps_user");
      set({
        user: null,
        isAuthenticated: false,
        wallet: { amountAvail: "0", amountLocked: "0" },
      });
    },

    setWallet: (wallet: UserWallet) => set({ wallet }),

    fetchWallet: async () => {
      try {
        const live = await userService.getLiveState();
        const data = live?.data || live;
        const balances = data?.balances;
        if (balances) {
          set({
            wallet: {
              amountAvail: String(balances.available_bal ?? balances.amountAvail ?? "0"),
              amountLocked: String(balances.locked_bal ?? balances.amountLocked ?? "0"),
            },
          });
        }
      } catch (err) {
        console.error("Failed to fetch live wallet:", err);
      }
    },
  };
});
