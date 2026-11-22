import { useMarketStore } from "../stores/useMarketStore";
import { useUserStore } from "../stores/useUserStore";
import { useAuthStore } from "../stores/useAuthStore";
import type { TradeFill } from "../types";

const WS_URL = "ws://localhost:3001";

class WebSocketManager {
  private ws: WebSocket | null = null;
  private currentSymbol: string | null = null;
  private pingInterval: any = null;
  private reconnectTimeout: any = null;
  private isConnecting = false;

  public connect(symbol?: string) {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      if (symbol && symbol !== this.currentSymbol) {
        this.switchSymbol(symbol);
      }
      return;
    }

    this.isConnecting = true;
    if (symbol) this.currentSymbol = symbol;

    const token = localStorage.getItem("perps_token");
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
      // unsubscribe from old channels
      this.send({
        action: "unsubscribe",
        channels: [`depth:${this.currentSymbol}`, `trades:${this.currentSymbol}`],
      });
    }

    this.currentSymbol = newSymbol;
    this.subscribeToMarket(newSymbol);
  }

  private subscribeToMarket(symbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.send({
      action: "subscribe",
      channels: [`depth:${symbol}`, `trades:${symbol}`],
    });
  }

  private handleMessage(payload: any) {
    const { channel, data, type } = payload;

    if (type === "pong") return;

    if (channel && channel.startsWith("depth:")) {
      if (data) {
        useMarketStore.getState().setOrderbook({
          bids: data.bids || [],
          asks: data.asks || [],
          lastTradedPrice: data.lastTradedPrice,
        });
        if (data.lastTradedPrice) {
          useMarketStore.getState().setMarkPrice(String(data.lastTradedPrice));
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
  }
}

export const wsManager = new WebSocketManager();
