"use client";

import { useEffect, useMemo, useState } from "react";
import { useSignalsStore } from "@/store/signals-store";
import { Card, Stat, Badge } from "@/components/ui";
import { ConvictionBadge } from "@/components/ConvictionBadge";
import { type Signal } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

/* The Signals page is the exact MIRROR of the TradingApp admin "Positions" page:
   same two tabs (Active / Closed), same columns, same live cadence — but every
   row is the counter side of the trader's position (side flipped, SL/TP swapped,
   P&L negated). Trader identity is deliberately NOT carried across: subscribers
   see the trade, never who took it. */

type Tab = "open" | "closed";

const price = (n: number) => parseFloat(n.toFixed(2)).toString();
const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const signed = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pnlClass = (n: number) => (n > 0 ? "text-long" : n < 0 ? "text-short" : "text-muted");

const dt = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function SignalsPage() {
  const { signals, loading, live, load, connect, disconnect } = useSignalsStore();
  const [tab, setTab] = useState<Tab>("open");
  const [query, setQuery] = useState("");

  useEffect(() => {
    void load();
    connect();
    return () => disconnect();
  }, [load, connect, disconnect]);

  const active = useMemo(
    () => signals.filter((s) => s.status === "active").sort((a, b) => b.openedAt - a.openedAt),
    [signals],
  );
  const closed = useMemo(
    () => signals.filter((s) => s.status === "closed").sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)),
    [signals],
  );

  const q = query.trim().toLowerCase();
  const matches = (s: Signal) => !q || `${s.symbol} ${s.market} ${s.side}`.toLowerCase().includes(q);
  const openRows = active.filter(matches);
  const closedRows = closed.filter(matches);

  const openUnrealized = active.reduce((a, s) => a + (s.unrealizedPnl ?? 0), 0);
  const closedRealized = closed.reduce((a, s) => a + (s.pnl ?? 0), 0);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Signals</h1>
          <p className="text-sm text-muted">Every open and closed signal, live.</p>
        </div>
        <div className={cn("flex shrink-0 items-center gap-1.5 text-sm", live ? "text-long" : "text-muted")}>
          <span className={cn("h-2 w-2 rounded-full", live ? "bg-long animate-pulse" : "bg-muted-2")} />
          {live ? "Live" : "Reconnecting…"}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open signals" value={active.length} />
        <Stat label="Open P&L" value={money(openUnrealized)} tone={openUnrealized >= 0 ? "long" : "short"} />
        <Stat label="Closed signals" value={closed.length} />
        <Stat label="Closed P&L" value={money(closedRealized)} tone={closedRealized >= 0 ? "long" : "short"} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-1">
            <TabButton active={tab === "open"} onClick={() => setTab("open")}>
              Active ({active.length})
            </TabButton>
            <TabButton active={tab === "closed"} onClick={() => setTab("closed")}>
              Closed ({closed.length})
            </TabButton>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by market, side…"
            className="h-9 w-full max-w-xs rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-2 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="overflow-x-auto">
          {tab === "open" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <Th>Market</Th>
                  <Th>Side</Th>
                  <Th className="text-center">Conviction</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Entry</Th>
                  <Th className="text-right">Target</Th>
                  <Th className="text-right">Stop</Th>
                  <Th className="text-right">Open P&L</Th>
                  <Th>Opened</Th>
                </tr>
              </thead>
              <tbody>
                {openRows.map((s) => <OpenRow key={s.id} s={s} />)}
                {openRows.length === 0 && (
                  <EmptyRow span={9}>
                    {loading ? "Loading…" : active.length === 0 ? "No open signals right now." : "No matching signals."}
                  </EmptyRow>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <Th>Market</Th>
                  <Th>Side</Th>
                  <Th className="text-center">Conviction</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Entry</Th>
                  <Th className="text-right">Exit</Th>
                  <Th className="text-right">Result</Th>
                  <Th>Opened</Th>
                  <Th>Closed</Th>
                </tr>
              </thead>
              <tbody>
                {closedRows.map((s) => <ClosedRow key={s.id} s={s} />)}
                {closedRows.length === 0 && (
                  <EmptyRow span={9}>
                    {loading ? "Loading…" : closed.length === 0 ? "No closed signals yet." : "No matching signals."}
                  </EmptyRow>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <p className="mt-3 text-xs text-muted-2">
        Open P&L is marked to the live market; closed P&L is final.
      </p>
    </div>
  );
}

function SideBadge({ side }: { side: string }) {
  return <Badge tone={side === "LONG" ? "long" : "short"}>{side}</Badge>;
}

/** Over the daily limit: tease the row, hide every tradeable level behind a lock. */
const LOCK = <span className="select-none blur-[3px]">•••••</span>;

function LockedRow({ s, span }: { s: Signal; span: number }) {
  const when = s.status === "active" ? s.openedAt : (s.closedAt ?? s.openedAt);
  return (
    <tr className="border-b border-border/60 text-muted hover:bg-surface-2">
      <Td className="font-medium text-muted">{s.symbol}</Td>
      <Td><SideBadge side={s.side} /></Td>
      <Td className="text-center"><ConvictionBadge level={s.conviction} /></Td>
      {Array.from({ length: span - 5 }).map((_, i) => (
        <Td key={i} className="nums text-right text-muted-2">{LOCK}</Td>
      ))}
      <Td className="nums text-muted">{dt(when)}</Td>
      <Td>
        <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Upgrade
        </span>
      </Td>
    </tr>
  );
}

function OpenRow({ s }: { s: Signal }) {
  if (s.locked) return <LockedRow s={s} span={9} />;
  const pnl = s.unrealizedPnl ?? 0;
  return (
    <tr className={cn("border-b border-border/60", s.side === "LONG" ? "bg-long/5" : "bg-short/5", "hover:bg-surface-2")}>
      <Td className="font-medium">{s.symbol}</Td>
      <Td><SideBadge side={s.side} /></Td>
      <Td className="text-center"><ConvictionBadge level={s.conviction} /></Td>
      <Td className="nums text-right">{s.quantity}</Td>
      <Td className="nums text-right font-medium">{price(s.entry)}</Td>
      <Td className="nums text-right">
        {s.takeProfit != null ? <span className="text-long">{price(s.takeProfit)}</span> : <span className="text-muted-2">—</span>}
      </Td>
      <Td className="nums text-right">
        {s.stopLoss != null ? <span className="text-short">{price(s.stopLoss)}</span> : <span className="text-muted-2">—</span>}
      </Td>
      <Td className={cn("nums text-right font-medium", pnlClass(pnl))}>{signed(pnl)}</Td>
      <Td className="nums text-muted"><span title={dt(s.openedAt)}>{timeAgo(s.openedAt)}</span></Td>
    </tr>
  );
}

function ClosedRow({ s }: { s: Signal }) {
  if (s.locked) return <LockedRow s={s} span={9} />;
  const pnl = s.pnl ?? 0;
  return (
    <tr className="border-b border-border/60 text-muted hover:bg-surface-2">
      <Td className="font-medium text-foreground">{s.symbol}</Td>
      <Td><SideBadge side={s.side} /></Td>
      <Td className="text-center"><ConvictionBadge level={s.conviction} /></Td>
      <Td className="nums text-right">{s.quantity}</Td>
      <Td className="nums text-right">{price(s.entry)}</Td>
      <Td className="nums text-right">{s.exit != null ? price(s.exit) : "—"}</Td>
      <Td className={cn("nums text-right font-medium", pnlClass(pnl))}>{signed(pnl)}</Td>
      <Td className="nums text-muted-2">{dt(s.openedAt)}</Td>
      <Td className="nums text-muted-2">{s.closedAt != null ? dt(s.closedAt) : "—"}</Td>
    </tr>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-surface-3 text-foreground" : "text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 font-medium", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2.5", className)}>{children}</td>;
}
function EmptyRow({ span, children }: { span: number; children: React.ReactNode }) {
  return (
    <tr><td colSpan={span} className="px-4 py-12 text-center text-sm text-muted">{children}</td></tr>
  );
}
