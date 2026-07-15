"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Dashboard, type DashboardMarket } from "@/lib/api";
import { getToken, useAuthStore } from "@/store/auth-store";
import { buildSeries, RANGES, type RangeKey, type SeriesPoint } from "@/lib/dashboard-series";
import { Card } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";

const BLUE = "#3b82f6";
const price = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>(RANGES[2]!); // 30D

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    const load = () =>
      api.dashboard(token)
        .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
    void load();
    const id = setInterval(load, 5000); // keep the overview fresh
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const markets = data?.markets ?? [];
  const sel: DashboardMarket | null = markets.find((m) => m.market === selected) ?? markets[0] ?? null;

  const series = useMemo<SeriesPoint[]>(
    () => (sel ? buildSeries(sel.market, range, sel.conviction, sel.activeSignal?.entry) : []),
    [sel, range],
  );

  const firstName = (user?.name || user?.email || "trader").split(/[ @]/)[0];

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">
        Welcome back, {firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "trader"} <span className="ml-0.5">👋</span>
      </h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <select
                value={sel?.market ?? ""}
                onChange={(e) => setSelected(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-sm font-semibold outline-none focus:border-primary"
              >
                {markets.map((m) => <option key={m.market} value={m.market}>{m.market}</option>)}
              </select>
              <span className="text-xs text-muted">{sel ? `${sel.name} · ${sel.exchange} · Live Range` : "Live Range"}</span>
            </div>
            <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => setRange(r)}
                  className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition", range.label === r.label ? "bg-white text-black" : "text-muted hover:text-foreground")}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <LiveRangeChart series={series} />
            {!loading && markets.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">No markets available for your access.</div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-center gap-5 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white" /> Price</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: BLUE }} /> Conviction Oscillator</span>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="mb-1 text-sm font-semibold">Conviction</div>
            <ConvictionGauge value={sel?.conviction ?? 0} bias={sel?.bias ?? null} />
          </Card>
          <Card className="flex-1 p-4">
            <div className="mb-3 text-sm font-semibold">Trade Details</div>
            <TradeDetails m={sel} />
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- Live Range chart (dual axis: price left, conviction 0-100 right) -------

function LiveRangeChart({ series }: { series: SeriesPoint[] }) {
  const W = 1000, H = 340, padL = 52, padR = 44, padT = 14, padB = 26;
  if (series.length < 2) return <div className="flex h-[340px] items-center justify-center text-sm text-muted">No data</div>;

  const prices = series.map((p) => p.price);
  let pmin = Math.min(...prices), pmax = Math.max(...prices);
  const pad = (pmax - pmin) * 0.15 || pmax * 0.001;
  pmin -= pad; pmax += pad;

  const n = series.length;
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const yP = (p: number) => padT + (1 - (p - pmin) / (pmax - pmin || 1)) * (H - padT - padB);
  const yC = (c: number) => padT + (1 - c / 100) * (H - padT - padB);

  const priceLine = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yP(p.price).toFixed(1)}`).join(" ");
  const convLine = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yC(p.conviction).toFixed(1)}`).join(" ");
  const convArea = `${convLine} L${x(n - 1).toFixed(1)},${(H - padB).toFixed(1)} L${x(0).toFixed(1)},${(H - padB).toFixed(1)} Z`;

  const last = series[n - 1]!;
  const convTicks = [0, 25, 50, 75, 100];
  const priceTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => pmin + f * (pmax - pmin));
  const step = Math.max(1, Math.floor(n / 5));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: "auto" }}>
      <defs>
        <linearGradient id="convFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BLUE} stopOpacity="0.45" />
          <stop offset="100%" stopColor={BLUE} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {convTicks.map((c) => (
        <g key={c}>
          <line x1={padL} y1={yC(c)} x2={W - padR} y2={yC(c)} stroke="var(--color-border, #243049)" strokeDasharray="3 4" strokeWidth="1" opacity="0.5" />
          <text x={W - padR + 6} y={yC(c) + 3} fontSize="11" fill="var(--color-muted-2, #6b7890)">{c}</text>
        </g>
      ))}
      {priceTicks.map((p, i) => (
        <text key={i} x={padL - 8} y={yP(p) + 3} fontSize="11" fill="var(--color-muted-2, #6b7890)" textAnchor="end">{price(p)}</text>
      ))}
      {series.map((p, i) => (i % step === 0 || i === n - 1 ? (
        <text key={i} x={x(i)} y={H - 8} fontSize="10.5" fill="var(--color-muted-2, #6b7890)" textAnchor="middle">
          {new Date(p.t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </text>
      ) : null))}

      <path d={convArea} fill="url(#convFill)" />
      <path d={convLine} fill="none" stroke={BLUE} strokeWidth="2" />
      <path d={priceLine} fill="none" stroke="#e8edf6" strokeWidth="1.6" />
      <circle cx={x(n - 1)} cy={yC(last.conviction)} r="4.5" fill={BLUE} stroke="#0b0f17" strokeWidth="1.5" />
    </svg>
  );
}

// --- conviction gauge (semicircle) -----------------------------------------

function ConvictionGauge({ value, bias }: { value: number; bias: string | null }) {
  const v = Math.max(0, Math.min(100, value));
  const cx = 100, cy = 100, r = 78;
  const track = `M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`;
  const angle = Math.PI - (v / 100) * Math.PI;
  const nx = cx + r * 0.82 * Math.cos(angle);
  const ny = cy - r * 0.82 * Math.sin(angle);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" width="100%" height={130}>
        <path d={track} fill="none" stroke="var(--color-surface-3, #202838)" strokeWidth="12" strokeLinecap="round" />
        <path d={track} fill="none" stroke={BLUE} strokeWidth="12" strokeLinecap="round" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - v} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#e8edf6" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="#e8edf6" />
      </svg>
      <div className="-mt-6 text-center">
        <div className="text-3xl font-semibold nums text-primary">{Math.round(v)}%</div>
        <div className="mt-0.5 text-xs text-muted">Bias: {bias ?? "—"}</div>
      </div>
    </div>
  );
}

// --- trade details ---------------------------------------------------------

function TradeDetails({ m }: { m: DashboardMarket | null }) {
  const s = m?.activeSignal;
  if (!s) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        </div>
        <div className="text-sm font-medium text-foreground">Waiting for a setup</div>
        <div className="mt-1 max-w-[220px] text-xs text-muted">Trade details appear here once a confirmed entry triggers.</div>
      </div>
    );
  }
  const isLong = s.side === "LONG";
  return (
    <div className="space-y-2.5 text-sm">
      <Detail label="Direction" value={<span className={isLong ? "text-long" : "text-short"}>{isLong ? "↑ Long" : "↓ Short"}</span>} />
      <Detail label="Entry" value={<span className="nums">{price(s.entry)}</span>} />
      <Detail label="Stop" value={<span className="nums text-short">{s.stopLoss != null ? price(s.stopLoss) : "—"}</span>} />
      <Detail label="Target" value={<span className="nums text-long">{s.takeProfit != null ? price(s.takeProfit) : "—"}</span>} />
      <Detail label="Conviction" value={`Phase ${s.conviction}`} />
      <Detail label="Opened" value={<span className="text-muted">{timeAgo(s.openedAt)}</span>} />
      {s.unrealizedPnl != null && (
        <Detail label="Open P&L" value={<span className={cn("nums font-medium", s.unrealizedPnl >= 0 ? "text-long" : "text-short")}>{s.unrealizedPnl >= 0 ? "+" : "-"}${Math.abs(s.unrealizedPnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>} />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
