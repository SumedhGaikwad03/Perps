import axios from "axios";

// API client pointing to backend server
export const api = axios.create({
  baseURL: "http://localhost:3000/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

// Attach JWT token automatically to protected requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("perps_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers.token = token;
  }
  return config;
});

export const authService = {
  signup: async (username: string, password: string) => {
    const res = await api.post("/signup", { username, password });
    return res.data;
  },
  signin: async (username: string, password: string) => {
    const res = await api.post("/signin", { username, password });
    return res.data;
  },
};

export const marketService = {
  getMarkets: async () => {
    const res = await api.get("/markets");
    return res.data;
  },
  getDepth: async (marketId: string) => {
    const res = await api.get(`/market/depth?marketId=${marketId}`);
    return res.data;
  },
};

export const orderService = {
  placeOrder: async (data: {
    price: string;
    qty: string;
    side: "BID" | "ASK";
    marketId: string;
    orderType?: "LIMIT" | "MARKET";
    leverage?: string;
    timeInForce?: "GTC" | "IOC";
    reduceOnly?: boolean;
  }) => {
    const res = await api.post("/order", {
      orderType: "LIMIT",
      leverage: "5",
      timeInForce: "GTC",
      reduceOnly: false,
      ...data,
    });
    return res.data;
  },
  cancelOrder: async (orderId: string, marketId: string, side: "BID" | "ASK") => {
    const res = await api.delete(`/order/${orderId}`, {
      data: { marketId, side },
    });
    return res.data;
  },
};

export const walletService = {
  deposit: async (amount: string) => {
    const res = await api.post("/onRamp", { amount });
    return res.data;
  },
};

export const userService = {
  getLiveState: async () => {
    const res = await api.get("/user/live");
    return res.data;
  },
};
