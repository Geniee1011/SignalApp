"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const maxMarketN = useMemo(() => Math.max(1, ...(data?.byMarket.map((m) => m.n) ?? [1])), [data]);

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
            <Stat label="Profit" value={formatCurrency(data.totalPnl)} tone={data.totalPnl >= 0 ? "long" : "short"} />
            <Stat label="Profit Factor" value={data.profitFactor.toFixed(2)} />
            <Stat label="Avg R:R" value={`${data.avgRR.toFixed(1)}×`} />
            <Stat label="Max DD" value={formatCurrency(-data.maxDrawdown)} tone="short" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="p-4 lg:col-span-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">Equity Curve</div>
                <div className={cn("nums text-sm font-medium", data.totalPnl >= 0 ? "text-long" : "text-short")}>{formatCurrency(data.totalPnl)}</div>
              </div>
              <EquityChart points={data.equityCurve} />
            </Card>

            <Card className="p-4 lg:col-span-2">
              <div className="mb-3 text-sm font-medium">Win Rate by Market</div>
              <div className="space-y-2.5">
                {data.byMarket.map((m) => (
                  <div key={m.market}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="font-medium text-foreground">{m.market} <span className="text-muted-2">· {m.n}</span></span>
                      <span className="nums text-muted">{m.winRate.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, m.winRate)}%` }} />
                    </div>
                  </div>
                ))}
                {data.byMarket.length === 0 && <div className="py-6 text-center text-sm text-muted">No trades.</div>}
              </div>
              <div className="mt-3 text-[10px] text-muted-2">Bar = win rate · number = trades</div>
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
                    const r = (s.pnl ?? 0) / risk;
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
  if (points.length === 0) return <div className="flex h-48 items-center justify-center text-sm text-muted">No data yet</div>;
  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const W = 100, H = 100;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - ((v - min) / span) * H;
  const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ");
  const area = `0,${y(min).toFixed(2)} ${line} ${W},${y(min).toFixed(2)}`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 220 }}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#eq)" />
        <polyline points={line} fill="none" stroke="var(--color-primary)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-2"><span>{points[0]!.day}</span><span>{points[points.length - 1]!.day}</span></div>
    </div>
  );
}
