import { useMarketStore } from "../stores/useMarketStore";
import { useUserStore } from "../stores/useUserStore";
import { useAuthStore } from "../stores/useAuthStore";
import type { TradeFill } from "../types";

const WS_URL = "ws://localhost:3001";

class WebSocketManager {
  private ws: WebSocket | null = null;
  private binanceWs: WebSocket | null = null;
  private currentSymbol: string | null = null;
  private pingInterval: any = null;
  private reconnectTimeout: any = null;
  private isConnecting = false;

  public initBinanceFeed() {
    try {
      if (this.binanceWs) return;
      this.binanceWs = new WebSocket(
        "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker/solusdt@ticker"
      );

      this.binanceWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const tick = msg.data;
          if (!tick?.s || !tick?.c) return;

          const symbolUpper = tick.s.toUpperCase();
          const baseToken = symbolUpper.startsWith("BTC")
            ? "BTC"
            : symbolUpper.startsWith("ETH")
            ? "ETH"
            : symbolUpper.startsWith("SOL")
            ? "SOL"
            : null;

          const currentMarket = useMarketStore.getState().activeMarket;
          const activeBase = (currentMarket?.baseToken || "BTC").toUpperCase();

          if (baseToken === activeBase && parseFloat(tick.c) > 0) {
            useMarketStore.getState().setMarkPrice(String(tick.c));
          }
        } catch {}
      };

      this.binanceWs.onerror = () => {};
      this.binanceWs.onclose = () => {
        this.binanceWs = null;
        setTimeout(() => this.initBinanceFeed(), 5000);
      };
    } catch {}
  }

  public connect(symbol?: string) {
    this.initBinanceFeed();
    const token = localStorage.getItem("perps_token");

    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      if (token) {
        this.authenticate(token);
      }
      if (symbol && symbol !== this.currentSymbol) {
        this.switchSymbol(symbol);
      }
      return;
    }

    this.isConnecting = true;
    if (symbol) this.currentSymbol = symbol;

    const url = token ? `${WS_URL}?token=${token}` : WS_URL;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnecting = false;
        console.log("[WS] Connected to Gateway at", WS_URL);

        // start keepalive heartbeat ping
        this.startHeartbeat();

        // authenticate in-socket if token exists
        if (token) {
          this.send({ action: "auth", token });
        }

        // subscribe to current market streams if symbol is selected
        if (this.currentSymbol) {
          this.subscribeToMarket(this.currentSymbol);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleMessage(payload);
        } catch (e) {
          console.error("[WS] Error parsing message:", e);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.cleanup();
        console.warn("[WS] Connection lost. Reconnecting in 3s...");
        this.reconnectTimeout = setTimeout(() => this.connect(this.currentSymbol || undefined), 3000);
      };

      this.ws.onerror = (err) => {
        console.error("[WS] Socket error:", err);
        this.ws?.close();
      };
    } catch (e) {
      this.isConnecting = false;
      this.reconnectTimeout = setTimeout(() => this.connect(this.currentSymbol || undefined), 3000);
    }
  }

  public switchSymbol(newSymbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.currentSymbol = newSymbol;
      return;
    }

    if (this.currentSymbol) {
      const oldMarket = useMarketStore.getState().markets.find((m) => m.symbol === this.currentSymbol);
      const oldBase = oldMarket?.baseToken || "BTC";
      // unsubscribe from old channels
      this.send({
        action: "unsubscribe",
        channels: [
          `depth:${this.currentSymbol}`,
          `trades:${this.currentSymbol}`,
          `markPrice:${this.currentSymbol}`,
          `markPrice:${oldBase}`,
        ],
      });
    }

    this.currentSymbol = newSymbol;
    this.subscribeToMarket(newSymbol);
  }

  public authenticate(token: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ action: "auth", token });
    }
  }

  private subscribeToMarket(symbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const marketObj = useMarketStore.getState().markets.find((m) => m.symbol === symbol);
    const baseToken = marketObj?.baseToken || "BTC";

    this.send({
      action: "subscribe",
      channels: [
        `depth:${symbol}`,
        `trades:${symbol}`,
        `markPrice:${symbol}`,
        `markPrice:${baseToken}`,
      ],
    });
  }

  private handleMessage(payload: any) {
    const { channel, data, type } = payload;

    if (type === "pong") return;

    // Real-time mark price from WebSocket
    if (channel && channel.startsWith("markPrice:")) {
      if (data && data.markPrice && parseFloat(data.markPrice) > 0) {
        useMarketStore.getState().setMarkPrice(String(data.markPrice));
      }
      return;
    }

    if (channel && channel.startsWith("depth:")) {
      if (data) {
        useMarketStore.getState().setOrderbook({
          bids: data.bids || [],
          asks: data.asks || [],
          lastTradedPrice: data.lastTradedPrice,
        });
        // only update markPrice if explicit markPrice is provided
        if (data.markPrice && parseFloat(data.markPrice) > 0) {
          useMarketStore.getState().setMarkPrice(String(data.markPrice));
        }
      }
      return;
    }

    if (channel && channel.startsWith("trades:")) {
      if (data && data.fills) {
        data.fills.forEach((fill: any) => {
          const trade: TradeFill = {
            price: fill.price,
            qty: fill.qty,
            timestamp: data.timestamp || Date.now(),
            side: fill.takerSide === "BID" ? "BUY" : "SELL",
            makerOrderId: fill.makerOrderId,
            takerOrderId: fill.takerOrderId,
          };
          useMarketStore.getState().addTrade(trade);
        });
      }
      return;
    }

    // real-time wallet update (WALLET_UPDATE)
    if (data && data.eventType === "WALLET_UPDATE") {
      useAuthStore.getState().setWallet({
        amountAvail: String(data.amountAvail ?? data.available_bal ?? "0"),
        amountLocked: String(data.amountLocked ?? data.locked_bal ?? "0"),
      });
      useUserStore.getState().fetchLiveUser();
    }

    // private user order updates (ORDER_UPDATE, ORDER_CANCELLED)
    if (data && (data.eventType === "ORDER_UPDATE" || data.eventType === "ORDER_CANCELLED")) {
      useUserStore.getState().updateOrder({
        orderId: data.orderId,
        status: data.status,
        filledQty: data.executeQty,
      });
      // refresh user state to update balances & positions
      useUserStore.getState().fetchLiveUser();
      useAuthStore.getState().fetchWallet();
    }
  }

  private send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeat() {
    clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      this.send({ action: "ping" });
    }, 15000);
  }

  private cleanup() {
    clearInterval(this.pingInterval);
    clearTimeout(this.reconnectTimeout);
  }

  public disconnect() {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.binanceWs) {
      this.binanceWs.close();
      this.binanceWs = null;
    }
  }
}

export const wsManager = new WebSocketManager();
