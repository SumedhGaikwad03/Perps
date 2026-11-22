# Web Frontend Terminal (`apps/web`)

The **Web Frontend Terminal** is a high-performance, multi-page derivatives trading terminal built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, **Zustand**, and **TradingView Lightweight Charts**.

For full UI architectural details, see [apps/web Documentation](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/applications/WEB_FRONTEND.md).

---

## Key Features & Pages

### 1. Multi-Page Navigation
* **Live Trading Terminal (`/live`)**: High-density derivatives terminal with an interactive L2 orderbook, live trade tape, perpetual candlestick chart, smart order entry form, active positions, and open resting orders.
* **Markets Directory (`/markets`)**: 24-hour volume metrics, token search, base currency filters (`ALL`, `BTC`, `ETH`, `SOL`), and 1-click execution routing to `/live`.
* **Portfolio & Risk Dashboard (`/portfolio`)**: Dedicated account view displaying total equity, available collateral, locked margin breakdown (positions vs orders), real-time risk utilization meter (<50% Safe, 50-80% Moderate, >80% High Risk), 3% MMR maintenance margin, liquidation buffer, and cross-market positions.

### 2. Market Execution & Charting
* **Perp Price Candlestick Engine**: Powered by [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/) driven by executed trade fills (`orderbook.lastTradedPrice` and live trade prints) with persistent local storage (`perps_chart_perp_candles_<symbol>`) and real-time Perp vs Index Mark Price spread badge.
* **Real-Time Orderbook Ladder**: Cumulative bids and asks depth bars with real-time mid-price snapping and dynamic tick sizing.
* **Smart Reduce Only Order Flow**: Auto-detects active position, automatically aligns order side (Buy to close Short; Sell to close Long), disables invalid directions, enforces `$0.00` initial margin requirement (`No locked balance needed`), and provides position-relative quick sizing buttons (`25%`, `50%`, `75%`, `100%`).
* **Precise Liquidation Pricing**: Dynamic client-side liquidation price calculation derived from entry price, leverage, and 3% MMR, eliminating `$0.00` fallback artifacts.
* **Multi-Channel WebSockets**: Authenticated WebSocket streaming over port `3001` handling `depth:<symbol>`, `trades:<symbol>`, and private user balance/fill execution streams.

---

## Running the Web Terminal

```bash
# Install dependencies
bun install

# Start Vite development server (Port 5173)
bun run dev

# Compile production bundle
bun run build

# Type check
bun run check-types
```
