"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Performance } from "@/lib/api";
import { getToken } from "@/store/auth-store";
import { Card, Stat } from "@/components/ui";
import { formatCurrency, cn } from "@/lib/utils";

const RANGES = [
  { label: "All time", days: 0 },
  { label: "90D", days: 90 },
  { label: "30D", days: 30 },
  { label: "7D", days: 7 },
];

const price = (n: number) => parseFloat(n.toFixed(2)).toLocaleString("en-US");
const dateOf = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// The demo P&L is normalized to this reference risk to derive each trade's FIXED
// R-multiple (a trade's R is a property of its price move vs. its stop, not of your
// sizing). Dollar figures then scale as (your risk ÷ this), so Profit, Max DD, the
// per-market $, and the equity curve all respond to the Risk/trade input.
const REF_RISK = 500;

export default function PerformancePage() {
  const [data, setData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(0);
  const [market, setMarket] = useState("");
  const [risk, setRisk] = useState(500); // $ per trade → drives R-multiples

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      setData(await api.performance(token, { sinceMs: days === 0 ? 0 : Date.now() - days * 86_400_000, market: market || undefined }));
    } finally {
      setLoading(false);
    }
  }, [days, market]);

  useEffect(() => { void load(); }, [load]);

  const markets = useMemo(() => data?.byMarket.map((m) => m.market) ?? [], [data]);
  const byProfit = useMemo(() => [...(data?.byMarket ?? [])].sort((a, b) => b.pnl - a.pnl), [data]);
  const maxAbsPnl = useMemo(() => Math.max(1, ...(data?.byMarket.map((m) => Math.abs(m.pnl)) ?? [1])), [data]);
  // Average R per trade — the strategy's fixed R-multiple (independent of your sizing).
  const avgR = useMemo(() => (data && data.totalTrades ? data.totalPnl / data.totalTrades / REF_RISK : 0), [data]);
  // Dollars scale with the user's risk-per-trade: 1R = $risk.
  const scale = risk / REF_RISK;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Performance</h1>
          <p className="text-sm text-muted">Verified signal track record · {market || "all markets"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
            <span className="text-muted">Risk / trade $</span>
            <input type="number" value={risk} min={1} onChange={(e) => setRisk(Math.max(1, Number(e.target.value) || 1))} className="w-16 bg-transparent text-right font-medium outline-none nums" />
          </label>
          <select value={market} onChange={(e) => setMarket(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary">
            <option value="">All markets</option>
            {markets.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary">
            {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-muted">{loading ? "Loading…" : "No data."}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Win Rate" value={`${data.winRate.toFixed(0)}%`} tone="long" />
            <Stat label="Total Trades" value={data.totalTrades} />
            <Stat label="Profit" value={formatCurrency(data.totalPnl * scale)} tone={data.totalPnl >= 0 ? "long" : "short"} />
            <Stat label="Profit Factor" value={data.profitFactor.toFixed(2)} />
            <Stat label="Avg R" value={`${avgR >= 0 ? "+" : ""}${avgR.toFixed(1)}R`} tone={avgR >= 0 ? "long" : "short"} />
            <Stat label="Max DD" value={formatCurrency(-data.maxDrawdown * scale)} tone="short" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="p-4 lg:col-span-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">Equity Curve</div>
                <div className={cn("nums text-sm font-medium", data.totalPnl >= 0 ? "text-long" : "text-short")}>{formatCurrency(data.totalPnl * scale)}</div>
              </div>
              <EquityChart points={data.equityCurve.map((p) => ({ ...p, value: p.value * scale }))} />
            </Card>

            <Card className="p-4 lg:col-span-2">
              <div className="mb-3 text-sm font-medium">Profit by Market</div>
              <div className="space-y-2.5">
                {byProfit.map((m) => {
                  const pos = m.pnl >= 0;
                  const w = Math.max(2, (Math.abs(m.pnl) / maxAbsPnl) * 100);
                  return (
                    <div key={m.market}>
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="font-medium text-foreground">{m.market} <span className="text-muted-2">· {m.n}</span></span>
                        <span className={cn("nums font-medium", pos ? "text-long" : "text-short")}>
                          {formatCurrency(m.pnl * scale)} <span className="font-normal text-muted-2">· {pos ? "+" : ""}{(m.pnl / REF_RISK).toFixed(1)}R</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                        <div className={cn("h-full rounded-full", pos ? "bg-long" : "bg-short")} style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  );
                })}
                {data.byMarket.length === 0 && <div className="py-6 text-center text-sm text-muted">No trades.</div>}
              </div>
              <div className="mt-3 text-[10px] text-muted-2">Bar = profit · number = trades · $ at ${risk}/trade</div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">Recent Closed Trades</div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Market</th>
                    <th className="px-4 py-2 font-medium">Direction</th>
                    <th className="px-4 py-2 text-right font-medium">Entry</th>
                    <th className="px-4 py-2 text-right font-medium">Exit</th>
                    <th className="px-4 py-2 text-right font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((s) => {
                    const r = (s.pnl ?? 0) / REF_RISK;
                    const winTrade = (s.pnl ?? 0) >= 0;
                    return (
                      <tr key={s.id} className="border-b border-border/60 hover:bg-surface-2">
                        <td className="px-4 py-2 text-muted">{s.closedAt ? dateOf(s.closedAt) : "—"}</td>
                        <td className="px-4 py-2 font-medium">{s.symbol}</td>
                        <td className="px-4 py-2">
                          <span className={cn("inline-flex items-center gap-1", s.side === "LONG" ? "text-info" : "text-short")}>
                            {s.side === "LONG" ? "↑" : "↓"} {s.side === "LONG" ? "Long" : "Short"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right nums text-muted">{price(s.entry)}</td>
                        <td className="px-4 py-2 text-right nums text-muted">{s.exit != null ? price(s.exit) : "—"}</td>
                        <td className={cn("px-4 py-2 text-right nums font-medium", winTrade ? "text-long" : "text-short")}>
                          {r >= 0 ? "+" : ""}{r.toFixed(1)}R {winTrade ? "✓" : "✗"}
                        </td>
                      </tr>
                    );
                  })}
                  {data.recent.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No closed trades.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function EquityChart({ points }: { points: { day: string; value: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return <div className="flex h-48 items-center justify-center text-sm text-muted">No data yet</div>;

  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const W = 100, H = 100;
  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - ((v - min) / span) * H;
  const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ");
  const area = `0,${y(min).toFixed(2)} ${line} ${W},${y(min).toFixed(2)}`;

  // Map a client X to the nearest data-point index (chart is stretched, so use the rect).
  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (n - 1)));
  };

  const hp = hover != null ? points[hover]! : null;
  const hx = hp ? x(hover!) : 0; // 0-100 → percent
  const hy = hp ? y(hp.value) : 0; // 0-100 → percent
  const tipLeft = Math.min(86, Math.max(14, hx));

  return (
    <div>
      <div
        ref={ref}
        className="relative touch-none"
        style={{ height: 220 }}
        onMouseMove={(e) => pick(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => pick(e.touches[0]!.clientX)}
        onTouchMove={(e) => pick(e.touches[0]!.clientX)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
          <defs>
            <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#eq)" />
          <polyline points={line} fill="none" stroke="var(--color-primary)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>

        {hp && (
          <>
            <div className="pointer-events-none absolute inset-y-0 w-px bg-primary/50" style={{ left: `${hx}%` }} />
            <div className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary" style={{ left: `${hx}%`, top: `${hy}%` }} />
            <div className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-center shadow-lg" style={{ left: `${tipLeft}%` }}>
              <div className={cn("nums text-sm font-semibold", hp.value >= 0 ? "text-long" : "text-short")}>{formatCurrency(hp.value)}</div>
              <div className="text-[10px] text-muted">{hp.day}</div>
            </div>
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-2"><span>{points[0]!.day}</span><span>{points[n - 1]!.day}</span></div>
    </div>
  );
}
