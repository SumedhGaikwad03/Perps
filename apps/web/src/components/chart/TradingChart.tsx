import React, { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi } from "lightweight-charts";
import { useMarketStore } from "../../stores/useMarketStore";

export const TradingChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const { activeMarket, markPrice } = useMarketStore();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize Lightweight Chart
    const chart = createChart(chartContainerRef.current, {
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

    // Seed mock initial candlestick data for realism
    const basePrice = activeMarket ? parseFloat(activeMarket.lastTradedPrice || "89000") : 89000;
    const now = Math.floor(Date.now() / 1000);
    const initialData = [];
    let current = basePrice;

    for (let i = 60; i >= 0; i--) {
      const time = (now - i * 60) as any;
      const change = (Math.random() - 0.49) * (basePrice * 0.003);
      const open = current;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * (basePrice * 0.001);
      const low = Math.min(open, close) - Math.random() * (basePrice * 0.001);
      current = close;

      initialData.push({ time, open, high, low, close });
    }

    candleSeries.setData(initialData);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // Handle responsive container resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [activeMarket?.id]);

  // Update chart when real-time markPrice updates
  useEffect(() => {
    if (!candleSeriesRef.current || !markPrice || parseFloat(markPrice) <= 0) return;

    const price = parseFloat(markPrice);
    const now = (Math.floor(Date.now() / 60000) * 60) as any;

    try {
      candleSeriesRef.current.update({
        time: now,
        open: price,
        high: price * 1.0005,
        low: price * 0.9995,
        close: price,
      });
    } catch {}
  }, [markPrice]);

  return (
    <div className="relative flex h-full w-full flex-col bg-canvas">
      {/* Timeframe & Chart Controls Header */}
      <div className="flex h-9 items-center justify-between border-b border-borderDark px-3">
        <div className="flex items-center gap-1">
          {["1m", "5m", "15m", "1h", "4h", "1D"].map((tf, idx) => (
            <button
              key={tf}
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                idx === 1
                  ? "bg-accent/20 text-accent"
                  : "text-slate-400 hover:bg-surface hover:text-white"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="text-[11px] font-mono text-slate-500">
          Lightweight Canvas Engine
        </div>
      </div>

      {/* Chart Canvas */}
      <div ref={chartContainerRef} className="h-full w-full flex-1" />
    </div>
  );
};
