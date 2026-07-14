"use client";

import { useEffect, useMemo } from "react";
import { useSignalsStore } from "@/store/signals-store";
import { Card, Stat } from "@/components/ui";
import { type Signal } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

const price = (n: number) => parseFloat(n.toFixed(2)).toString();
const signed = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export default function SignalsPage() {
  const { signals, loading, live, load, connect, disconnect } = useSignalsStore();

  useEffect(() => {
    void load();
    connect();
    return () => disconnect();
  }, [load, connect, disconnect]);

  const active = useMemo(() => signals.filter((s) => s.status === "active").sort((a, b) => b.openedAt - a.openedAt), [signals]);
  const closed = useMemo(() => signals.filter((s) => s.status === "closed").sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)), [signals]);
  const rows = useMemo(() => [...active, ...closed], [active, closed]);

  const decided = closed.filter((s) => s.win !== null);
  const wins = decided.filter((s) => s.win).length;
  const winRate = decided.length ? Math.round((wins / decided.length) * 100) : 0;
  const profit = closed.reduce((a, s) => a + (s.pnl ?? 0), 0) + active.reduce((a, s) => a + (s.unrealizedPnl ?? 0), 0);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Signals</h1>
          <p className="text-sm text-muted">Live order-flow signals · open &amp; closed</p>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-long">
          <span className={cn("h-2 w-2 rounded-full", live ? "bg-long animate-pulse" : "bg-muted-2")} />
          {live ? "Live · looking for trades" : "Offline"}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open" value={active.length} />
        <Stat label="Closed 24h" value={closed.length} />
        <Stat label="Win rate" value={`${winRate}%`} tone="long" />
        <Stat label="Profit" value={signed(profit)} tone={profit >= 0 ? "long" : "short"} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <Th>Time</Th>
                <Th>Market</Th>
                <Th>Side</Th>
                <Th className="text-right">Entry</Th>
                <Th className="text-right">Stop</Th>
                <Th className="text-right">Target</Th>
                <Th className="text-right">Exit</Th>
                <Th>Status</Th>
                <Th className="text-right">Result</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => <Row key={s.id} s={s} />)}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-16 text-center text-sm text-muted">{loading ? "Loading…" : "No signals in the last 24 hours."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Row({ s }: { s: Signal }) {
  const active = s.status === "active";
  const isLong = s.side === "LONG";
  const result = active ? s.unrealizedPnl : s.pnl;

  // Over the subscriber's daily limit: the row teases (time/market/side) but the
  // tradeable levels and result are hidden behind a lock (upgrade prompt).
  if (s.locked) {
    const lock = <span className="select-none blur-[3px]">•••••</span>;
    return (
      <tr className="border-b border-border/60 text-muted hover:bg-surface-2">
        <Td className="border-l-2 border-l-transparent"><span className="text-muted-2">{timeAgo(active ? s.openedAt : s.closedAt ?? s.openedAt)}</span></Td>
        <Td className="font-semibold text-muted">{s.symbol}</Td>
        <Td><span className="inline-flex items-center gap-1 text-muted">{isLong ? "↑" : "↓"}{isLong ? "Long" : "Short"}</span></Td>
        <Td className="text-right nums text-muted-2">{lock}</Td>
        <Td className="text-right nums text-muted-2">{lock}</Td>
        <Td className="text-right nums text-muted-2">{lock}</Td>
        <Td className="text-right nums text-muted-2">{lock}</Td>
        <Td>
          <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Locked
          </span>
        </Td>
        <Td className="text-right"><span className="text-[11px] text-primary">Upgrade</span></Td>
      </tr>
    );
  }

  return (
    <tr
      className={cn(
        "border-b border-border/60",
        active ? (isLong ? "bg-long/5" : "bg-short/5") : "text-muted hover:bg-surface-2",
      )}
    >
      <Td className={cn("border-l-2", active ? (isLong ? "border-l-long" : "border-l-short") : "border-l-transparent")}>
        <span className={cn(!active && "text-muted-2")}>{timeAgo(active ? s.openedAt : s.closedAt ?? s.openedAt)}</span>
      </Td>
      <Td className={cn("font-semibold", active ? "text-foreground" : "text-muted")}>{s.symbol}</Td>
      <Td>
        {active ? (
          <span className={cn("inline-flex items-center gap-1.5 font-medium", isLong ? "text-long" : "text-short")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", isLong ? "bg-long" : "bg-short")} />
            {isLong ? "Long" : "Short"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted">
            <span>{isLong ? "↑" : "↓"}</span>
            {isLong ? "Long" : "Short"}
          </span>
        )}
      </Td>
      <Td className={cn("text-right nums", active ? "font-semibold text-foreground" : "text-muted")}>{price(s.entry)}</Td>
      <Td className={cn("text-right nums", active ? "text-short" : "text-muted-2")}>{s.stopLoss != null ? price(s.stopLoss) : "—"}</Td>
      <Td className={cn("text-right nums", active ? "text-long" : "text-muted-2")}>{s.takeProfit != null ? price(s.takeProfit) : "—"}</Td>
      <Td className="text-right nums text-muted-2">{s.exit != null ? price(s.exit) : "—"}</Td>
      <Td><span className={cn("text-xs", active ? "text-foreground" : "text-muted")}>{active ? "Open" : "Closed"}</span></Td>
      <Td className={cn("text-right nums font-medium", (result ?? 0) >= 0 ? "text-long" : "text-short")}>
        {result != null ? signed(result) : "—"}
      </Td>
    </tr>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 font-medium", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2.5", className)}>{children}</td>;
}
