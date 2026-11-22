import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi } from "lightweight-charts";
import { useMarketStore } from "../../stores/useMarketStore";

export const TradingChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const candlesRef = useRef<any[]>([]);

  const [activeTimeframe, setActiveTimeframe] = useState("1m");
  const { activeMarket, markPrice } = useMarketStore();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize Lightweight Chart
    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#0b0e14" },
        textColor: "#94a3b8",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#141a24" },
        horzLines: { color: "#141a24" },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: "#1e2638",
      },
      timeScale: {
        borderColor: "#1e2638",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#00e676",
      downColor: "#ff3355",
      borderVisible: false,
      wickUpColor: "#00e676",
      wickDownColor: "#ff3355",
    });

    // Persistent Candlestick Data Retrieval
    const marketSymbol = activeMarket?.symbol || "BTC_USDC";
    const storageKey = `perps_chart_candles_${marketSymbol}`;
    let candleData: any[] = [];

    const basePrice = activeMarket
      ? parseFloat(activeMarket.lastTradedPrice || activeMarket.markPrice || "89000")
      : 89000;
    const validBase = basePrice > 1000 ? basePrice : 89000;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out bad outliers (e.g. historical price 50 test fills)
          candleData = parsed.filter(
            (c) =>
              c &&
              typeof c.time === "number" &&
              typeof c.close === "number" &&
              c.low > validBase * 0.2 &&
              c.high < validBase * 5
          );
        }
      }
    } catch {}

    // If no saved history exists, generate initial realistic bars and persist
    if (!candleData || !Array.isArray(candleData) || candleData.length === 0) {
      const now = Math.floor(Date.now() / 60000) * 60;
      candleData = [];
      let current = validBase;

      for (let i = 60; i >= 0; i--) {
        const time = now - i * 60;
        const change = (Math.random() - 0.49) * (current * 0.002);
        const open = current;
        const close = Math.max(0.01, open + change);
        const high = Math.max(open, close) + Math.random() * (current * 0.001);
        const low = Math.min(open, close) - Math.random() * (current * 0.001);
        current = close;

        candleData.push({ time, open, high, low, close });
      }

      try {
        localStorage.setItem(storageKey, JSON.stringify(candleData));
      } catch {}
    }

    candlesRef.current = candleData;
    candleSeries.setData(candleData);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle responsive container resize via ResizeObserver and window events
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && chartRef.current && chartContainerRef.current) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            chartRef.current.applyOptions({ width, height });
          }
        }
      }
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [activeMarket?.id, activeMarket?.symbol]);

  // Real-time Bar Aggregation & Persistence when markPrice updates
  useEffect(() => {
    if (!candleSeriesRef.current || !markPrice || parseFloat(markPrice) <= 0) return;

    const price = parseFloat(markPrice);
    const nowSec = Math.floor(Date.now() / 60000) * 60; // 1-minute bucket timestamp

    const lastIndex = candlesRef.current.length - 1;
    const lastCandle = lastIndex >= 0 ? candlesRef.current[lastIndex] : null;

    // Outlier guard: discard anomalous price spikes
    if (lastCandle && (price < lastCandle.close * 0.2 || price > lastCandle.close * 5)) {
      return;
    }

    if (lastCandle && lastCandle.time === nowSec) {
      // Update existing 1-minute candle
      const updatedBar = {
        time: nowSec,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, price),
        low: Math.min(lastCandle.low, price),
        close: price,
      };
      candlesRef.current[lastIndex] = updatedBar;
      try {
        candleSeriesRef.current.update(updatedBar as any);
      } catch {}
    } else {
      // Open a new 1-minute candle bar
      const newBar = {
        time: nowSec,
        open: lastCandle ? lastCandle.close : price,
        high: price,
        low: price,
        close: price,
      };
      candlesRef.current.push(newBar);
      try {
        candleSeriesRef.current.update(newBar as any);
      } catch {}
    }

    // Persist latest 300 bars to local storage
    if (activeMarket?.symbol) {
      try {
        localStorage.setItem(
          `perps_chart_candles_${activeMarket.symbol}`,
          JSON.stringify(candlesRef.current.slice(-300))
        );
      } catch {}
    }
  }, [markPrice, activeMarket?.symbol]);

  return (
    <div className="relative flex h-full w-full flex-col bg-canvas">
      {/* Timeframe & Chart Controls Header */}
      <div className="shrink-0 flex h-9 items-center justify-between border-b border-borderDark px-3">
        <div className="flex items-center gap-1 shrink-0">
          {["1m", "5m", "15m", "1h", "4h", "1D"].map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={`rounded px-2 py-0.5 text-xs font-semibold transition ${
                activeTimeframe === tf
                  ? "bg-accent/20 text-accent font-bold"
                  : "text-slate-400 hover:bg-surface hover:text-white"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-500 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-bid animate-pulse" />
          <span>Persistent Canvas Engine</span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="relative min-h-0 min-w-0 flex-1 w-full h-full overflow-hidden" />
    </div>
  );
};
