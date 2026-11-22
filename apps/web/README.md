# Web Frontend Terminal (`apps/web`)

The **Web Frontend Terminal** is a high-performance, single-page trading interface built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, **Zustand**, and **TradingView Lightweight Charts**.

For full UI architectural details, see [apps/web Documentation](file:///c:/Users/777su/Desktop/Perps_Project/Perps/docs/applications/WEB_FRONTEND.md).

---

## Key Features

* **Real-time Orderbook Ladder**: Live rendering of cumulative bids and asks with spread calculation.
* **Interactive Candlestick Charting**: Powered by [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/) with client-side candlestick persistence in `localStorage` (`perps_chart_candles_<symbol>`) and dynamic 1-minute OHLC bar aggregation.
* **Dual Order Entry**: Limit and Market order submission with a customizable leverage slider (1x to 50x) and real-time margin requirements calculation.
* **Live Positions & Orders Tables**: Instant display of open orders (with `OPEN` and `PARTIAL` badges), position size, mark price, liquidation price, and PnL.
* **Multi-Channel WebSocket Streaming**: In-socket authentication, automatic reconnection, and subscription to `depth:<symbol>`, `trades:<symbol>`, and private user execution feeds.
* **Modal Dialogs**: Sign In / Sign Up, Collateral Deposit (On-Ramp), and Admin Market Creator.

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
