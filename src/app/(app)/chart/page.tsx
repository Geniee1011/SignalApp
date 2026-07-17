"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, createSeriesMarkers, ColorType, CrosshairMode,
  type IChartApi, type ISeriesApi, type UTCTimestamp, type SeriesMarker, type Time,
  type ISeriesMarkersPluginApi, type MouseEventParams,
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

// A trade reduced to its exact chart coordinates — used for the hover connector + tooltip.
interface TradePoint {
  id: string;
  side: "LONG" | "SHORT";
  entry: number;
  exit: number | null;
  pnl: number | null;
  unrealizedPnl: number | null;
  status: "active" | "closed";
  entryTime: UTCTimestamp;
  exitTime: UTCTimestamp | null;
}

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
      // Only ENTRY markers are drawn by default (arrow by side, blue long / amber
      // short). A trade's exit is revealed on demand — hover or click that trade and
      // its connector shows the exit (cyan end-dot) — so every exit isn't scattered
      // across the whole chart at once.
      out.push({
        time: snap(s.openedAt),
        position: isLong ? "belowBar" : "aboveBar",
        color: isLong ? "#3b82f6" : "#f5a623",
        shape: isLong ? "arrowUp" : "arrowDown",
      });
    }
    return out.sort((a, b) => (a.time as number) - (b.time as number));
  }, [symbolSignals, res]);

  // Exact per-trade coordinates for the hover connector/tooltip (snapped to the resolution grid).
  const tradePoints = useMemo<TradePoint[]>(() => {
    const snap = (ms: number) => (Math.floor(ms / 1000 / res) * res) as UTCTimestamp;
    return symbolSignals.map((s) => ({
      id: s.id,
      side: s.side,
      entry: s.entry,
      exit: s.exit,
      pnl: s.pnl,
      unrealizedPnl: s.unrealizedPnl,
      status: s.status,
      entryTime: snap(s.openedAt),
      exitTime: s.closedAt != null ? snap(s.closedAt) : null,
    }));
  }, [symbolSignals, res]);

  const closedForSymbol = useMemo(() => symbolSignals.filter((s) => s.status === "closed").sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)), [symbolSignals]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Chart</h1>
        <p className="text-sm text-muted">Live signals · hover a trade to reveal its exit · click for full details</p>
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
          <ChartCanvas candles={displayCandles} markers={markers} trades={tradePoints} />
          {usingDemo && (
            <div className="pointer-events-none absolute left-2 top-2 rounded-md border border-border bg-surface-2/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted backdrop-blur">
              Demo data
            </div>
          )}
          {loading && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading chart…</div>}
          {!loading && displayCandles.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Market data temporarily unavailable</div>}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><span style={{ color: "#3b82f6" }}>▲</span> Long entry</span>
          <span className="inline-flex items-center gap-1"><span style={{ color: "#f5a623" }}>▼</span> Short entry</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-[2.5px] w-3 rounded-full align-middle" style={{ background: "#22d3ee" }} /> Exit</span>
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

// Horizontal pixels within which a click selects a trade's time column.
const CLICK_RADIUS = 22;

interface Connector { x1: number; y1: number; x2: number; y2: number; side: "LONG" | "SHORT" }

function ChartCanvas({ candles, markers, trades }: { candles: Candle[]; markers: SeriesMarker<Time>[]; trades: TradePoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const tradesRef = useRef<TradePoint[]>(trades);
  const closeAtRef = useRef<Map<number, number>>(new Map()); // bar time → close, for anchoring the connector
  const tipRef = useRef<{ x: number; y: number; t: TradePoint } | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  const [tip, setTip] = useState<{ x: number; y: number; t: TradePoint } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [connector, setConnector] = useState<Connector | null>(null);
  const [isLight, setIsLight] = useState(false); // theme, for the SVG overlay colors

  useEffect(() => { tradesRef.current = trades; }, [trades]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" } },
      timeScale: { timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16c784", downColor: "#ea3943", borderVisible: false, wickUpColor: "#16c784", wickDownColor: "#ea3943",
    });

    // Chart colors are baked into canvas options, so they do NOT follow CSS theme
    // changes. Re-apply them whenever `data-theme` flips — otherwise the chart keeps
    // the theme it was built with (e.g. near-white gridlines left over on dark mode).
    const applyTheme = () => {
      const light = document.documentElement.getAttribute("data-theme") === "light";
      const grid = light ? "#eef1f6" : "#1a2130";
      const border = light ? "#e2e7ee" : "#243049";
      chart.applyOptions({
        layout: { textColor: light ? "#586573" : "#8a97ad" },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        rightPriceScale: { borderColor: border },
        timeScale: { borderColor: border },
      });
      setIsLight(light);
    };
    applyTheme();
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, [] as SeriesMarker<Time>[]);

    // The "active" trade to visualise is the pinned (clicked) one, else the hovered
    // one. Its entry→exit connector is drawn as an SVG overlay ABOVE the candles (a
    // chart series would be painted over by them). Re-run on pan/zoom/resize.
    const redraw = () => {
      const cs = seriesRef.current;
      const active = tipRef.current?.t ?? tradesRef.current.find((t) => t.id === hoverIdRef.current) ?? null;
      if (!cs || !active || active.exitTime == null || active.exit == null || active.exitTime === active.entryTime) { setConnector(null); return; }
      const ts = chart.timeScale();
      const closeAt = closeAtRef.current;
      const av = (tt: UTCTimestamp, fb: number) => closeAt.get(tt as number) ?? fb;
      const x1 = ts.timeToCoordinate(active.entryTime), y1 = cs.priceToCoordinate(av(active.entryTime, active.entry));
      const x2 = ts.timeToCoordinate(active.exitTime), y2 = cs.priceToCoordinate(av(active.exitTime, active.exit));
      if (x1 == null || y1 == null || x2 == null || y2 == null) { setConnector(null); return; }
      setConnector({ x1, y1, x2, y2, side: active.side });
    };
    redrawRef.current = redraw;
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    const ro = new ResizeObserver(() => redraw());
    ro.observe(ref.current);

    // Find the trade whose entry/exit time-column the cursor is over (or null).
    const detectTrade = (param: MouseEventParams): { t: TradePoint; x: number; y: number } | null => {
      const pt = param.point, cs = seriesRef.current;
      if (!pt || !cs) return null;
      const ts = chart.timeScale();
      const closeAt = closeAtRef.current;
      const anchor = (tt: UTCTimestamp, fb: number) => closeAt.get(tt as number) ?? fb;
      let best: { t: TradePoint; x: number; y: number } | null = null;
      let bestScore = Infinity;
      for (const t of tradesRef.current) {
        const candidates: Array<[UTCTimestamp, number]> = [[t.entryTime, anchor(t.entryTime, t.entry)]];
        if (t.exitTime != null && t.exit != null) candidates.push([t.exitTime, anchor(t.exitTime, t.exit)]);
        for (const [tt, pv] of candidates) {
          const x = ts.timeToCoordinate(tt);
          if (x == null) continue;
          const dx = Math.abs(x - pt.x);
          if (dx > CLICK_RADIUS) continue; // must be within this trade's time column
          const y = cs.priceToCoordinate(pv);
          const dy = y == null ? 0 : Math.abs(y - pt.y);
          const score = dx * 4 + dy * 0.15;
          if (score < bestScore) { bestScore = score; best = { t, x, y: y ?? pt.y }; }
        }
      }
      return best;
    };

    // HOVER a trade → preview its exit connector (line + cyan exit dot). No dialog.
    const onMove = (param: MouseEventParams) => {
      const id = detectTrade(param)?.t.id ?? null;
      if (id !== hoverIdRef.current) { hoverIdRef.current = id; setHoveredId(id); }
    };
    // CLICK a trade → pin its full detail dialog (toggle off on re-click / empty click).
    const onClick = (param: MouseEventParams) => {
      const best = detectTrade(param);
      if (!best) { setTip(null); return; }
      const b = best;
      setTip((prev) => (prev && prev.t.id === b.t.id ? null : { x: b.x, y: b.y, t: b.t }));
    };
    chart.subscribeCrosshairMove(onMove);
    chart.subscribeClick(onClick);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.unsubscribeClick(onClick);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);
      themeObserver.disconnect();
      ro.disconnect();
      chart.remove();
      chartRef.current = null; seriesRef.current = null; markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    const m = new Map<number, number>();
    for (const c of candles) m.set(c.time, c.close);
    closeAtRef.current = m;
    setTip(null); // clears the connector via the effect below
    if (candles.length) chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => { markersRef.current?.setMarkers(markers); }, [markers]);

  // Keep refs in sync and redraw the SVG connector whenever the pinned OR hovered trade changes.
  useEffect(() => { tipRef.current = tip; hoverIdRef.current = hoveredId; redrawRef.current(); }, [tip, hoveredId]);

  return (
    <div style={{ position: "relative", width: "100%", height: 440 }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      {connector && (
        <svg className="pointer-events-none absolute inset-0 z-10" width="100%" height="100%">
          <line
            x1={connector.x1} y1={connector.y1} x2={connector.x2} y2={connector.y2}
            stroke={isLight ? "#334155" : "#e2e8f0"} strokeWidth="1.5" strokeDasharray="5 3" strokeLinecap="round"
          />
          {/* Endpoints as short horizontal ticks (price levels) rather than dots — they
              stay legible when a trade's entry and exit sit on adjacent bars. */}
          <line
            x1={connector.x1 - 6} y1={connector.y1} x2={connector.x1 + 6} y2={connector.y1}
            stroke={connector.side === "LONG" ? "#3b82f6" : "#f5a623"} strokeWidth="2.5" strokeLinecap="round"
          />
          <line
            x1={connector.x2 - 6} y1={connector.y2} x2={connector.x2 + 6} y2={connector.y2}
            stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round"
          />
        </svg>
      )}
      {tip && <HoverTip tip={tip} width={ref.current?.clientWidth ?? 0} onClose={() => setTip(null)} />}
    </div>
  );
}

function HoverTip({ tip, width, onClose }: { tip: { x: number; y: number; t: TradePoint }; width: number; onClose: () => void }) {
  const t = tip.t;
  const isLong = t.side === "LONG";
  const profit = t.status === "closed" ? t.pnl : t.unrealizedPnl;
  const W = 176;
  // Fixed at the TOP-RIGHT so the dialog's position is predictable. It's click-through
  // (only the ✕ takes pointer events), so a trade underneath stays interactive.
  const left = Math.max(8, width - W - 8);
  const top = 8;
  return (
    <div className="pointer-events-none absolute z-20 rounded-lg border border-border bg-surface/95 p-2.5 text-xs shadow-lg backdrop-blur" style={{ left, top, width: W }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={cn("font-semibold", isLong ? "text-info" : "text-short")}>{isLong ? "↑ Long" : "↓ Short"}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-2">{t.status === "closed" ? "Closed" : "Open"}</span>
          {/* Only the button takes pointer events — the rest of the dialog stays
              click-through so it never blocks the chart underneath. */}
          <button
            onClick={onClose}
            aria-label="Close trade details"
            className="pointer-events-auto -mr-1 flex h-4 w-4 items-center justify-center rounded text-muted-2 transition hover:bg-surface-3 hover:text-foreground"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
      </div>
      <TipRow label="Entry" value={price(t.entry)} />
      <TipRow label="Exit" value={t.exit != null ? price(t.exit) : t.status === "active" ? "Open" : "—"} />
      <div className="mt-1.5 flex items-center justify-between border-t border-border/60 pt-1.5">
        <span className="text-muted">{t.status === "closed" ? "Profit" : "Open P&L"}</span>
        <span className={cn("nums font-semibold", (profit ?? 0) >= 0 ? "text-long" : "text-short")}>
          {profit != null ? formatCurrency(profit) : "—"}
        </span>
      </div>
    </div>
  );
}

function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="nums">{value}</span>
    </div>
  );
}
