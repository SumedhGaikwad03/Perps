# Web Frontend (`apps/web`)

The **Web Frontend** is a single-page application built with React 19, TypeScript, Vite, Tailwind CSS, Lucide React, Zustand, and TradingView Lightweight Charts. It provides an institutional trading terminal interface for perpetual futures trading.

---

## 1. Responsibilities & Structure

### Core Responsibilities:
1. **Interactive Trading Interface**: Professional multi-pane layout featuring an L2 orderbook ladder, live trade tape, candlestick chart, order placement form, open orders table, and active positions table.
2. **Real-time State Management**: Powered by three centralized Zustand stores (`useMarketStore`, `useUserStore`, `useAuthStore`).
3. **In-Socket Authentication & Multi-Channel Streaming**: Automatically establishes and authenticates WebSocket connections on login, subscribing to live market depth, public trades, and private user channels.
4. **Client-Side Candlestick Persistence**: Persists historical minute candles in browser `localStorage` (`perps_chart_candles_<symbol>`) and dynamically aggregates real-time 1-minute OHLC bars from mark price ticks.
5. **Interactive Modals**: Dedicated dialogs for authentication (Sign In / Sign Up), collateral deposits (On-Ramp), and market creation (Admin Market Creator with secret validation).

### Source File Structure:
```
apps/web/
├── index.html                         # HTML template with Google Fonts
├── vite.config.ts                     # Vite build and dev server config
├── tailwind.config.js                 # Styling and theme palette
├── src/
│   ├── main.tsx                       # React DOM entry point
│   ├── App.tsx                        # Main terminal shell and component grid
│   ├── index.css                      # Global styles and Tailwind directives
│   ├── types/
│   │   └── index.ts                   # Frontend domain types
│   ├── services/
│   │   ├── api.ts                     # Axios REST client with token injection
│   │   └── websocket.ts               # WebSocket manager, reconnection, pub/sub dispatcher
│   ├── stores/
│   │   ├── useAuthStore.ts            # Authentication state, login, signup, logout
│   │   ├── useMarketStore.ts          # Selected market, markets list, depth ladder, trades
│   │   └── useUserStore.ts            # Balances, positions, open orders, live polling
│   └── components/
│       ├── layout/
│       │   ├── Header.tsx             # Navbar, market dropdown, wallet balance, auth buttons
│       │   └── BottomTabs.tsx         # Tabbed view switcher for Positions and Orders
│       ├── chart/
│       │   └── TradingChart.tsx       # TradingView lightweight-charts with localStorage cache
│       ├── order/
│       │   └── OrderEntry.tsx         # Buy/Sell form, Limit/Market selector, leverage slider
│       ├── orderbook/
│       │   └── OrderbookLadder.tsx    # L2 Depth ladder with cumulative depth visualizers
│       ├── trades/
│       │   └── TradeTape.tsx          # Real-time scrolling public trades list
│       ├── positions/
│       │   ├── PositionsTable.tsx     # Active positions table, mark price PnL, exit button
│       │   └── OpenOrdersTable.tsx    # Open orders table with PARTIAL/OPEN badges & cancel button
│       └── modals/
│           ├── AuthModal.tsx          # Login and register modal dialog
│           ├── DepositModal.tsx       # USDC On-Ramp deposit modal
│           └── CreateMarketModal.tsx  # Admin market creation modal with secret token
```

---

## 2. Zustand State Management Architecture

### 1. `useAuthStore`
File: [apps/web/src/stores/useAuthStore.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/src/stores/useAuthStore.ts)
* **Properties**: `user: { id, token } | null`, `isAuthenticated: boolean`, `isLoading: boolean`.
* **Behavior**:
  - Restores session on load from `localStorage.getItem("token")` and `localStorage.getItem("userId")`.
  - Upon successful `signIn` or `signUp`, saves credentials, sets Axios headers, and immediately triggers `wsManager.authenticate(token)` to authorize in-flight WebSockets.

### 2. `useMarketStore`
File: [apps/web/src/stores/useMarketStore.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/src/stores/useMarketStore.ts)
* **Properties**: `markets: Market[]`, `selectedMarket: Market | null`, `depth: { bids, asks }`, `trades: Trade[]`, `markPrice: number`.
* **Actions**:
  - `fetchMarkets()`: Queries `GET /api/v1/markets`.
  - `selectMarket(market)`: Switches active symbol, resubscribes WebSocket to `depth:<symbol>` and `trades:<symbol>`, clears previous orderbook depth, and triggers chart reload.
  - `setDepth(depth)`: Updates bid/ask ladder in real time.
  - `addTrade(trade)`: Prepends trade print to the public tape (capped at 50 trades).

### 3. `useUserStore`
File: [apps/web/src/stores/useUserStore.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/src/stores/useUserStore.ts)
* **Properties**: `balance: { available_bal, locked_bal }`, `positions: Position[]`, `openOrders: Order[]`.
* **Actions**:
  - `fetchLiveUserData()`: Calls `GET /api/v1/live` to synchronize memory mirrors with the frontend.
  - `applyUserEvent(event)`: Handles live updates from `pub:user:<userId>` (wallet updates, order fills, order cancellations).

---

## 3. Real-time Charting & Candlestick Persistence

File: [apps/web/src/components/chart/TradingChart.tsx](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/src/components/chart/TradingChart.tsx)

* Uses [lightweight-charts](https://tradingview.github.io/lightweight-charts/) to render high-performance candlestick charts.
* **Storage Key**: `perps_chart_candles_<symbol>`.
* **OHLC Real-time Aggregation**: When mark price updates arrive over WebSockets, the chart evaluates the current minute bucket:
  - If a candle exists for the current minute: updates `high = Math.max(high, markPrice)`, `low = Math.min(low, markPrice)`, and `close = markPrice`.
  - If a new minute has elapsed: finalizes the previous bar and instantiates a new candlestick `{ time, open: markPrice, high: markPrice, low: markPrice, close: markPrice }`.
  - Persists the updated candle buffer into `localStorage` on each tick.
