# System Architecture Diagrams

This document contains visual Mermaid diagrams depicting the physical, logical, data, and process relationships across the Perps Trading Platform.

---

## 1. Physical Service & Port Map

```mermaid
graph LR
    subgraph ClientBrowser ["Trader Environment"]
        ViteUI["Trading Terminal UI<br/>(Port: 5173)"]
    end

    subgraph Infrastructure ["Local / Cloud Infrastructure"]
        Postgres[("PostgreSQL 16<br/>Port: 5432")]
        Redis[("Redis 7 (Streams/PubSub)<br/>Port: 6379")]
        BinanceFeed["Binance Futures WS<br/>wss://fstream.binance.com"]
    end

    subgraph PerpsMicroservices ["Monorepo Applications"]
        Backend["REST API Server (Express)<br/>Port: 3000"]
        WS["WebSocket Gateway (Bun)<br/>Port: 3001"]
        Engine["Matching & Risk Engine<br/>Daemon Process"]
        DBWorker["DB Persistence Worker<br/>Daemon Process"]
    end

    ViteUI -->|HTTP / JSON| Backend
    ViteUI <-->|WebSocket Frames| WS
    Backend -->|Database Queries| Postgres
    Backend <-->|Streams: engine / to-backend| Redis
    WS <-->|Pub/Sub & Depth Reader| Redis
    Engine <-->|Streams: engine / to-backend / db-events| Redis
    Engine <-->|Hashes: market:*:depth / user:*| Redis
    Engine <-->|Oracle Price Ticks| BinanceFeed
    Engine -.->|Boot State Hydration| Postgres
    DBWorker -->|Streams: db-events| Redis
    DBWorker -->|SQL Batches / Transactions| Postgres
```

---

## 2. Order Matching State Flow

```mermaid
flowchart TD
    Start([Incoming Order: BID / ASK]) --> ValidateOrder{Validate Inputs & Balance}
    ValidateOrder -- Insufficient Margin --> Reject[Reject with INSUFFICIENT_BALANCE]
    ValidateOrder -- Valid --> CheckOpposingBook{Check Opposing Book Depth}
    
    CheckOpposingBook -- Empty Book & MARKET --> CancelMarket[Reject: No Liquidity]
    CheckOpposingBook -- Empty Book & LIMIT --> InsertResting[Insert into PriceLevel Queue]
    
    CheckOpposingBook -- Compatible Prices Exist --> MatchLoop[Cross Price-Time Priority FIFO]
    
    MatchLoop --> ExecFill[Calculate Match Qty & Execution Price]
    ExecFill --> UpdatePosition[Update Positions & Realized PnL]
    ExecFill --> EmitTrade[Emit TRADE_EXECUTED to db-events]
    ExecFill --> BroadcastTrade[Publish pub:trades:MARKET]
    
    ExecFill --> CheckRemaining{Remaining Qty > 0?}
    CheckRemaining -- Yes & LIMIT --> InsertResting
    CheckRemaining -- Yes & MARKET --> CancelRemaining[Cancel Unfilled Qty]
    CheckRemaining -- No --> Complete[Order State: FILLED]
    
    InsertResting --> MirrorDepth[Update Redis Hashes & pub:depth]
    Complete --> MirrorDepth
    CancelRemaining --> MirrorDepth
    MirrorDepth --> ReplyLoopback[Reply to Backend via to-backend]
```

---

## 3. Database Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    User ||--o| Wallet : "owns"
    User ||--o{ Position : "holds"
    User ||--o{ Order : "places"
    User ||--o{ Fill : "maker_fills"
    User ||--o{ Fill : "taker_fills"

    Market ||--o{ Order : "trades_in"
    Market ||--o{ Position : "categorizes"
    Market ||--o{ Fill : "records"

    Order ||--o{ Fill : "maker_order"
    Order ||--o{ Fill : "taker_order"

    User {
        string id PK "UUID"
        string username UK "Unique login name"
        string password "Bun hashed password"
        datetime createdAt
        datetime updatedAt
    }

    Market {
        string id PK "UUID"
        string symbol UK "e.g. BTC_USDC"
        string slug UK "URL slug"
        string baseToken "BTC, ETH, SOL"
        string tickSize "Default 0.1"
        string stepSize "Default 0.001"
        string imgUrl "Icon URI"
        datetime createdAt
        datetime updatedAt
    }

    Wallet {
        string id PK "UUID"
        string userId FK,UK "Associated User"
        string amountAvail "Available margin"
        string amountLocked "Locked in orders/positions"
        datetime createdAt
        datetime updatedAt
    }

    Position {
        string id PK "UUID"
        string userId FK "Associated User"
        string marketId FK "Associated Market"
        string size "Signed string (>0 Long, <0 Short)"
        string entryPrice "Weighted average entry price"
        int leverage "Position leverage (1-50)"
        string liquidationPrice "Estimated liquidation mark price"
        datetime createdAt
        datetime updatedAt
    }

    Order {
        string id PK "UUIDv7"
        string userId FK "Trader"
        string marketId FK "Target Market"
        OrderType orderType "LIMIT or MARKET"
        OrderSide orderSide "BID or ASK"
        string price "Limit price"
        string qty "Total order size"
        string filledQty "Executed fill quantity"
        string initialMargin "Margin commitment"
        string lockedMargin "Current locked balance"
        OrderStatus status "OPEN, PARTIALLY_FILLED, FILLED, CANCELLED"
        TimeInForce timeInForce "GTC, FOK, IOC"
        boolean reduceOnly "Close-only execution"
        datetime createdAt
        datetime updatedAt
    }

    Fill {
        string id PK "UUID"
        string marketId FK "Market"
        string price "Execution price"
        string qty "Executed quantity"
        string maker_id FK "Resting maker trader"
        string taker_id FK "Aggressive taker trader"
        string maker_order_id FK "Resting order"
        string taker_order_id FK "Aggressive order"
        string makerFee "Maker fee rebate"
        string takerFee "Taker fee charged"
        datetime createdAt
    }
```
