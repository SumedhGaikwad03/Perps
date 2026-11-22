# Web Frontend (`apps/web`)

The **Web Frontend** is a multi-page trading application built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, **Lucide React**, **Zustand**, and **TradingView Lightweight Charts**. It delivers an institutional-grade derivatives interface with full market navigation, real-time portfolio management, and high-frequency execution.

---

## 1. Responsibilities & Structure

### Core Responsibilities:
1. **Multi-Page Terminal Routing**: Browser history-synchronized routing (`window.history.pushState` with `popstate` event handling) supporting `/live`, `/markets`, and `/portfolio`.
2. **Interactive Trading Interface (`/live`)**: Multi-pane layout featuring an L2 orderbook ladder, live trade tape, perpetual candlestick chart, smart order entry form, active positions, and open resting orders.
3. **Markets Directory (`/markets`)**: Searchable markets dashboard with 24-hour volume metrics, token categorization, and one-click execution routing.
4. **Portfolio & Margin Health Dashboard (`/portfolio`)**: Financial summary featuring total equity, free collateral, locked initial margin breakdown (positions vs orders), real-time risk utilization meter, 3% MMR calculation, liquidation buffer, and cross-market positions table.
5. **Perp Price Candlestick Engine**: Real-time TradingView candlestick chart driven by executed trade fills (`orderbook.lastTradedPrice` and live trade prints) with persistent local storage (`perps_chart_perp_candles_<symbol>`) and live Perp vs Index Mark Price spread badge.
6. **Smart Reduce Only Order Flow**: Auto-detects active position, automatically aligns order side (Buy to close Short; Sell to close Long), disables invalid directions, enforces `$0.00` initial margin requirement (`No locked balance needed`), and provides position-relative quick sizing buttons (`25%`, `50%`, `75%`, `100%`).
7. **Dynamic Liquidation Pricing**: Client-side calculation derived from entry price, leverage, and 3% MMR, eliminating `$0.00` fallback artifacts.
8. **In-Socket Authentication & Multi-Channel Streaming**: Automatically establishes and authenticates WebSocket connections on login, subscribing to live market depth, public trades, and private user execution feeds.

### Source File Structure:
```
apps/web/
├── index.html                         # HTML template with Google Fonts
├── vite.config.ts                     # Vite build and dev server config
├── tailwind.config.js                 # Styling and theme palette
├── src/
│   ├── main.tsx                       # React DOM entry point
│   ├── App.tsx                        # Multi-page router (/live, /markets, /portfolio)
│   ├── index.css                      # Global styles and Tailwind directives
│   ├── types/
│   │   └── index.ts                   # Frontend domain types
│   ├── utils/
│   │   └── format.ts                  # Decimal normalization and tick/step size formatters
│   ├── services/
│   │   ├── api.ts                     # Axios REST client with token injection
│   │   └── websocket.ts               # WebSocket manager, reconnection, pub/sub dispatcher
│   ├── stores/
│   │   ├── useAuthStore.ts            # Authentication state, login, signup, logout
│   │   ├── useMarketStore.ts          # Selected market, markets list, depth ladder, trades
│   │   └── useUserStore.ts            # Balances, positions, open orders, live polling
│   └── components/
│       ├── layout/
│       │   ├── Header.tsx             # Navbar pill navigation (/live, /markets, /portfolio), wallet balance, auth
│       │   └── BottomTabs.tsx         # Scoped positions and orders tabs with link to Portfolio
│       ├── chart/
│       │   └── TradingChart.tsx       # TradingView lightweight-charts with perp price feed and localStorage
│       ├── order/
│       │   └── OrderEntry.tsx         # Smart order form with Reduce Only auto-alignment and sizing
│       ├── orderbook/
│       │   └── OrderbookLadder.tsx    # L2 Depth ladder with cumulative depth visualizers
│       ├── trades/
│       │   └── TradeTape.tsx          # Real-time scrolling public trades list
│       ├── positions/
│       │   ├── PositionsTable.tsx     # Active positions table, mark price PnL, est liq price, market close
│       │   └── OpenOrdersTable.tsx    # Open orders table with PARTIAL/OPEN badges & cancel button
│       ├── markets/
│       │   └── MarketsPage.tsx        # 24h market stats, search, category filter, trade buttons
│       ├── portfolio/
│       │   └── PortfolioPage.tsx      # Full-page equity, margin health, collateral, and risk dashboard
│       └── modals/
│           ├── AuthModal.tsx          # Login and register modal dialog
│           ├── DepositModal.tsx       # USDC On-Ramp deposit modal
│           └── CreateMarketModal.tsx  # Admin market creation modal with secret token
```

---

## 2. Zustand State Management Architecture

### 1. `useAuthStore`
File: [apps/web/src/stores/useAuthStore.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/src/stores/useAuthStore.ts)
* **Properties**: `user: { id, token } | null`, `isAuthenticated: boolean`, `wallet: { amountAvail, amountLocked }`, `isLoading: boolean`.
* **Behavior**:
  - Restores session on load from `localStorage.getItem("token")` and `localStorage.getItem("userId")`.
  - Upon successful `signIn` or `signUp`, saves credentials, sets Axios headers, and immediately triggers `wsManager.authenticate(token)` to authorize in-flight WebSockets.

### 2. `useMarketStore`
File: [apps/web/src/stores/useMarketStore.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/src/stores/useMarketStore.ts)
* **Properties**: `markets: Market[]`, `activeMarket: Market | null`, `orderbook: { bids, asks }`, `trades: Trade[]`, `markPrice: string`.
* **Actions**:
  - `fetchMarkets()`: Queries `GET /api/v1/markets`.
  - `setActiveMarket(market)`: Switches active symbol, resubscribes WebSocket to `depth:<symbol>` and `trades:<symbol>`, clears previous orderbook depth, and triggers chart reload.
  - `setOrderbook(orderbook)`: Updates bid/ask ladder in real time.
  - `addTrade(trade)`: Prepends trade print to the public tape (capped at 50 trades).

### 3. `useUserStore`
File: [apps/web/src/stores/useUserStore.ts](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/src/stores/useUserStore.ts)
* **Properties**: `positions: Position[]`, `openOrders: OpenOrder[]`.
* **Actions**:
  - `fetchLiveUser()`: Calls `GET /api/v1/live` to synchronize memory mirrors with the frontend.
  - `updateOrder(order)`: Optimistically updates resting orders on fills or cancellations.

---

## 3. Real-Time Charting & Candlestick Persistence

File: [apps/web/src/components/chart/TradingChart.tsx](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/src/components/chart/TradingChart.tsx)

* Powered by [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/).
* **Data Sourcing**: Driven by actual matching engine executed trade prices (`trades[0]?.price`, `orderbook.lastTradedPrice`, and fallback `activeMarket.lastTradedPrice`) rather than external Binance mark prices.
* **Storage Key**: `perps_chart_perp_candles_<marketSymbol>`.
* **Real-Time Spread Badge**: Displays live `Perp Price`, `Mark Price`, and live calculated spread ($\pm\text{Spread}$) directly in the chart toolbar.
* **1-Minute Aggregation**: Live trades update the current minute bar:
  - If a candle exists for the current minute: updates `high = Math.max(high, price)`, `low = Math.min(low, price)`, and `close = price`.
  - If a new minute has elapsed: finalizes the previous bar and instantiates a new candlestick `{ time, open: price, high: price, low: price, close: price }`.
  - Persists the updated candle buffer into `localStorage` on each tick.

---

## 4. Smart Reduce Only Order Execution

File: [apps/web/src/components/order/OrderEntry.tsx](file:///c:/Users/777su/Desktop/Perps_Project/Perps/apps/web/src/components/order/OrderEntry.tsx)

* **Position Detection**: Matches open position for the active market.
* **Auto-Side Alignment**: Checking `Reduce Only` flips the order tab automatically (if holding Short, switches to Buy; if holding Long, switches to Sell) and pre-fills position size.
* **Zero Initial Margin**: Displays `$0.00 (No locked balance needed)` and hides liquidation estimate.
* **Direction Guard**: If a user attempts to sell while holding a Short position in Reduce Only mode, the panel warns `⚠️ You hold a SHORT position. Switch to Long / Buy to reduce it` and disables execution.
* **Position-Relative Sizing**: Quick size buttons (`25%`, `50%`, `75%`, `100%`) scale directly from the open position size.
