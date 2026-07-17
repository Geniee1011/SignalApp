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
import { Card } from "@/components/ui";
import { DateRangePicker, rangeLabel, ALL_TIME, type DateRange } from "@/components/DateRangePicker";
import { formatCurrency, cn } from "@/lib/utils";

// Design-demo fallback: on unless explicitly disabled. When the live feed returns
// no candles, show synthetic ones so the design is presentable. Self-reverses once
// the real feed serves data again. See src/lib/demo-candles.ts.
const DEMO_CHART = process.env.NEXT_PUBLIC_DEMO_CHART !== "0";

const MARKETS = ["ES", "NQ", "YM", "GC", "CL"];
const DESC: Record<string, string> = { ES: "S&P 500 · CME", NQ: "Nasdaq 100 · CME", YM: "Dow · CBOT", GC: "Gold · COMEX", CL: "Crude Oil · NYMEX" };
const TFS = [{ label: "1m", res: 60 }, { label: "5m", res: 300 }, { label: "15m", res: 900 }, { label: "1h", res: 3600 }, { label: "1D", res: 86400 }];
// Bars shown when the range is unbounded, and a hard cap so a wide range on a fine
// resolution (e.g. 30 days of 1m) doesn't try to draw tens of thousands of candles.
const DEFAULT_BARS = 300;
const MAX_BARS = 1500;
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
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  // The visible window: the calendar range, clamped to a sane bar count for the
  // chosen resolution. Candles AND signals both derive from it, so the markers,
  // the trades table and the price action always cover the same dates.
  const { bars, windowStart, windowEnd, live } = useMemo(() => {
    const end = range.to ?? Date.now();
    const spanMs = range.from != null ? end - range.from : DEFAULT_BARS * res * 1000;
    const n = Math.min(Math.max(Math.ceil(spanMs / (res * 1000)), 2), MAX_BARS);
    return { bars: n, windowStart: end - n * res * 1000, windowEnd: end, live: end >= Date.now() - 60_000 };
  }, [range, res]);

  // Candles. The backend serves "the last N bars", not an arbitrary range, so only
  // ask it for a live window — a historical range falls through to the demo series.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    const p = live ? api.chartHistory(token, symbol, res, bars) : Promise.resolve<Candle[]>([]);
    p.then((cs) => { if (!cancelled) { setCandles(cs); setLoading(false); } })
      .catch(() => { if (!cancelled) { setCandles([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [symbol, res, bars, live]);

  // Signals for exactly the window the candles cover.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    const load = () =>
      api.signalsRange(token, windowStart, windowEnd)
        .then((s) => { if (!cancelled) setSignals(s); })
        .catch(() => { if (!cancelled) setSignals([]); });
    void load();
    if (!live) return () => { cancelled = true; };
    const id = setInterval(load, 5000); // a live window keeps refreshing
    return () => { cancelled = true; clearInterval(id); };
  }, [windowStart, windowEnd, live]);

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
    return generateDemoCandles(symbol, res, bars, anchorPrice, windowEnd);
  }, [candles, symbol, res, bars, anchorPrice, windowEnd]);

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

      {/* No overflow-hidden here — it would clip the calendar's popover. */}
      <Card className="p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-sm font-semibold outline-none focus:border-primary">
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-xs text-muted">{DESC[symbol] ?? ""} · {rangeLabel(range)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={range} onChange={setRange} />
            <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
              {TFS.map((tf) => (
                <button key={tf.res} onClick={() => setRes(tf.res)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", res === tf.res ? "bg-primary text-white" : "text-muted hover:text-foreground")}>
                  {tf.label}
                </button>
              ))}
            </div>
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
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: "#22d3ee" }} /> Exit</span>
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

/* The connector has to stay readable on top of candles, which are themselves
 * green/red and of every luminance. Two consequences drive the drawing below:
 *   - Contrast comes from a dark CASING under a bright line (the technique road
 *     maps use over satellite imagery), not from hue. A thin line in any single
 *     colour will always vanish against some candle.
 *   - The line therefore stays neutral, and the win/loss read is carried by the
 *     P&L pill instead — colouring the line green/red would collide with the very
 *     candles it has to be legible against. */
const CHART_H = 440;
const CASING_W = 5; // dark outline under the 2px line
const LINE_W = 2; // dataviz spec: 2px lines
const DOT_R = 4.5; // ≥8px marker
const RING_W = 2; // dataviz spec: 2px ring so ends survive over any candle
const DASH = "5 4";

/** Compact signed P&L for the exit pill — cents are noise at chart scale. */
const pnlLabel = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
/** SVG text can't reflow, so the pill is sized to its label. Deliberately a slight
 *  over-estimate (~6.6px/glyph at 11px semibold) — spare padding beats an overflow. */
const pillWidth = (label: string) => Math.round(label.length * 6.6) + 16;

interface Connector {
  x1: number; y1: number; x2: number; y2: number;
  side: "LONG" | "SHORT";
  pnl: number | null;
  flip: boolean; // exit sits near the right edge → hang the pill to its left
}

function ChartCanvas({ candles, markers, trades }: { candles: Candle[]; markers: SeriesMarker<Time>[]; trades: TradePoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const tradesRef = useRef<TradePoint[]>(trades);
  const barsRef = useRef<Map<number, { o: number; c: number }>>(new Map()); // bar time → open/close, for anchoring
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
      if (!cs || !active || active.exitTime == null || active.exit == null) { setConnector(null); return; }
      const ts = chart.timeScale();
      const bars = barsRef.current;
      const eb = bars.get(active.entryTime as number);
      const xb = bars.get(active.exitTime as number);
      // A trade that opens AND closes inside one bar (duration < timeframe) would
      // collapse to a single point, since both ends anchor to that bar's close — so
      // span the bar open→close instead. Without this, short trades drew no line.
      const sameBar = active.exitTime === active.entryTime;
      const entryPrice = sameBar ? (eb?.o ?? active.entry) : (eb?.c ?? active.entry);
      const exitPrice = xb?.c ?? active.exit;
      const x1 = ts.timeToCoordinate(active.entryTime), y1 = cs.priceToCoordinate(entryPrice);
      const x2 = ts.timeToCoordinate(active.exitTime), y2 = cs.priceToCoordinate(exitPrice);
      if (x1 == null || y1 == null || x2 == null || y2 == null) { setConnector(null); return; }
      const pnl = active.status === "closed" ? active.pnl : active.unrealizedPnl;
      const w = ref.current?.clientWidth ?? 0;
      const pillW = pnl != null ? pillWidth(pnlLabel(pnl)) : 0;
      setConnector({ x1, y1, x2, y2, side: active.side, pnl, flip: x2 + DOT_R + 6 + pillW > w });
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
      const bars = barsRef.current;
      const anchor = (tt: UTCTimestamp, fb: number) => bars.get(tt as number)?.c ?? fb;
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
    const m = new Map<number, { o: number; c: number }>();
    for (const c of candles) m.set(c.time, { o: c.open, c: c.close });
    barsRef.current = m;
    setTip(null); // clears the connector via the effect below
    if (candles.length) chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => { markersRef.current?.setMarkers(markers); }, [markers]);

  // Keep refs in sync and redraw the SVG connector whenever the pinned OR hovered trade changes.
  useEffect(() => { tipRef.current = tip; hoverIdRef.current = hoveredId; redrawRef.current(); }, [tip, hoveredId]);

  return (
    <div style={{ position: "relative", width: "100%", height: CHART_H }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      {connector && (() => {
        // Casing is the opposite luminance of the line, so the pair reads on any candle.
        const casing = isLight ? "rgba(255,255,255,0.95)" : "rgba(2,6,23,0.92)";
        const ink = isLight ? "#0f172a" : "#f8fafc";
        const { x1, y1, x2, y2, pnl, flip } = connector;
        const win = (pnl ?? 0) >= 0;
        const label = pnl != null ? pnlLabel(pnl) : "";
        const pw = pillWidth(label);
        const px = flip ? x2 - DOT_R - 6 - pw : x2 + DOT_R + 6;
        // An exit against the top/bottom edge would hang the pill outside the pane.
        const py = Math.max(10, Math.min(CHART_H - 10, y2));
        return (
          <svg className="pointer-events-none absolute inset-0 z-10" width="100%" height="100%">
            {/* Same dash pattern at two widths: each bright dash lands inside its own
                dark dash, outlining the line instead of sitting flat on the candles. */}
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={casing} strokeWidth={CASING_W} strokeDasharray={DASH} strokeLinecap="round" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth={LINE_W} strokeDasharray={DASH} strokeLinecap="round" />

            {/* Entry keeps the side colour of its arrow marker; exit stays cyan. Both
                get a casing ring so they never dissolve into a same-coloured candle. */}
            <circle cx={x1} cy={y1} r={DOT_R} fill={connector.side === "LONG" ? "#3b82f6" : "#f5a623"} stroke={casing} strokeWidth={RING_W} />
            <circle cx={x2} cy={y2} r={DOT_R} fill="#22d3ee" stroke={casing} strokeWidth={RING_W} />

            {/* Outcome rides the pill, not the line — white on a filled swatch clears
                contrast, and keeps green/red off the stroke that crosses the candles. */}
            {pnl != null && (
              <g>
                <rect x={px} y={py - 9} width={pw} height={18} rx={9} fill={win ? "#16c784" : "#ea3943"} stroke={casing} strokeWidth={RING_W} />
                <text x={px + pw / 2} y={py} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={11} fontWeight={600}>
                  {label}
                </text>
              </g>
            )}
          </svg>
        );
      })()}
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
