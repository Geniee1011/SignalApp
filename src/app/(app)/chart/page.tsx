"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, createSeriesMarkers, ColorType, CrosshairMode,
  type IChartApi, type ISeriesApi, type UTCTimestamp, type SeriesMarker, type Time,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";
import { api, type Candle, type Signal } from "@/lib/api";
import { generateDemoCandles } from "@/lib/demo-candles";
import { getToken } from "@/store/auth-store";
import { useSignalsStore } from "@/store/signals-store";
import { Card } from "@/components/ui";
import { formatCurrency, cn } from "@/lib/utils";

// Design-demo fallback: on unless explicitly disabled. When the live feed returns
// no candles, show synthetic ones so the design is presentable. Self-reverses once
// the real feed serves data again. See src/lib/demo-candles.ts.
const DEMO_CHART = process.env.NEXT_PUBLIC_DEMO_CHART !== "0";

const MARKETS = ["ES", "NQ", "YM", "GC", "CL"];
const DESC: Record<string, string> = { ES: "S&P 500 · CME", NQ: "Nasdaq 100 · CME", YM: "Dow · CBOT", GC: "Gold · COMEX", CL: "Crude Oil · NYMEX" };
const TFS = [{ label: "1m", res: 60 }, { label: "5m", res: 300 }, { label: "15m", res: 900 }, { label: "1h", res: 3600 }, { label: "1D", res: 86400 }];
const price = (n: number) => parseFloat(n.toFixed(2)).toLocaleString("en-US");
const dateOf = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function ChartPage() {
  const [symbol, setSymbol] = useState("NQ");
  const [res, setRes] = useState(300);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  const { signals, load: loadSignals, connect, disconnect } = useSignalsStore();
  useEffect(() => { void loadSignals(); connect(); return () => disconnect(); }, [loadSignals, connect, disconnect]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    api.chartHistory(token, symbol, res, 300)
      .then((cs) => { if (!cancelled) { setCandles(cs); setLoading(false); } })
      .catch(() => { if (!cancelled) { setCandles([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [symbol, res]);

  const symbolSignals = useMemo(() => signals.filter((s) => s.market === symbol || s.symbol === symbol), [signals, symbol]);

  // Anchor demo candles to the real signal entries for this symbol so the chart
  // and the trades table stay visually coherent.
  const anchorPrice = useMemo(() => {
    const px = symbolSignals.map((s) => s.entry).filter((n) => n > 0);
    return px.length ? px.reduce((a, b) => a + b, 0) / px.length : undefined;
  }, [symbolSignals]);

  // Real candles when the feed has them; otherwise the design-demo fallback.
  const usingDemo = !loading && candles.length === 0 && DEMO_CHART;
  const displayCandles = useMemo<Candle[]>(() => {
    if (candles.length) return candles;
    if (!DEMO_CHART) return [];
    return generateDemoCandles(symbol, res, 300, anchorPrice);
  }, [candles, symbol, res, anchorPrice]);

  const markers = useMemo<SeriesMarker<Time>[]>(() => {
    const snap = (ms: number) => (Math.floor(ms / 1000 / res) * res) as UTCTimestamp;
    const out: SeriesMarker<Time>[] = [];
    for (const s of symbolSignals) {
      const isLong = s.side === "LONG";
      // One mark per trade — the entry arrow only, colored by side (green long /
      // red short), no text. Exits are intentionally NOT drawn: showing both entry
      // and exit doubled the marks and read as chaotic. The trades table below the
      // chart lists every exit price, so no information is lost.
      out.push({
        time: snap(s.openedAt),
        position: isLong ? "belowBar" : "aboveBar",
        color: isLong ? "#16c784" : "#ea3943",
        shape: isLong ? "arrowUp" : "arrowDown",
      });
    }
    return out.sort((a, b) => (a.time as number) - (b.time as number));
  }, [symbolSignals, res]);

  const closedForSymbol = useMemo(() => symbolSignals.filter((s) => s.status === "closed").sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)), [symbolSignals]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Chart</h1>
        <p className="text-sm text-muted">Live signals · entries &amp; exits marked on the chart</p>
      </div>

      <Card className="overflow-hidden p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-sm font-semibold outline-none focus:border-primary">
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-xs text-muted">{DESC[symbol] ?? ""} · Today</span>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
            {TFS.map((tf) => (
              <button key={tf.res} onClick={() => setRes(tf.res)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", res === tf.res ? "bg-primary text-white" : "text-muted hover:text-foreground")}>
                {tf.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <ChartCanvas candles={displayCandles} markers={markers} />
          {usingDemo && (
            <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-border bg-surface-2/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted backdrop-blur">
              Demo data
            </div>
          )}
          {loading && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading chart…</div>}
          {!loading && displayCandles.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Market data temporarily unavailable</div>}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><span style={{ color: "#16c784" }}>▲</span> Long entry</span>
          <span className="inline-flex items-center gap-1"><span style={{ color: "#ea3943" }}>▼</span> Short entry</span>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">Trades · {symbol}</div>
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Direction</th>
                <th className="px-4 py-2 text-right font-medium">Entry</th>
                <th className="px-4 py-2 text-right font-medium">Exit</th>
                <th className="px-4 py-2 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {closedForSymbol.map((s: Signal) => (
                <tr key={s.id} className="border-b border-border/60 hover:bg-surface-2">
                  <td className="px-4 py-2 text-muted">{s.closedAt ? dateOf(s.closedAt) : "—"}</td>
                  <td className="px-4 py-2"><span className={cn(s.side === "LONG" ? "text-info" : "text-short")}>{s.side === "LONG" ? "↑ Long" : "↓ Short"}</span></td>
                  <td className="px-4 py-2 text-right nums text-muted">{price(s.entry)}</td>
                  <td className="px-4 py-2 text-right nums text-muted">{s.exit != null ? price(s.exit) : "—"}</td>
                  <td className={cn("px-4 py-2 text-right nums font-medium", (s.pnl ?? 0) >= 0 ? "text-long" : "text-short")}>{s.pnl != null ? formatCurrency(s.pnl) : "—"}</td>
                </tr>
              ))}
              {closedForSymbol.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No closed {symbol} signals in the window.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ChartCanvas({ candles, markers }: { candles: Candle[]; markers: SeriesMarker<Time>[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const light = document.documentElement.getAttribute("data-theme") === "light";
    const grid = light ? "#eef1f6" : "#1a2130";
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: light ? "#586573" : "#8a97ad" },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: light ? "#e2e7ee" : "#243049" },
      timeScale: { borderColor: light ? "#e2e7ee" : "#243049", timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16c784", downColor: "#ea3943", borderVisible: false, wickUpColor: "#16c784", wickDownColor: "#ea3943",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, [] as SeriesMarker<Time>[]);
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; markersRef.current = null; };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    if (candles.length) chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => { markersRef.current?.setMarkers(markers); }, [markers]);

  return <div ref={ref} style={{ width: "100%", height: 440 }} />;
}
