"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui";
import { api, MARKETS, type CopyMode, type CopyOrder, type CopySettings } from "@/lib/api";
import { getToken } from "@/store/auth-store";
import { cn, timeAgo } from "@/lib/utils";

/* Automation — auto-copy settings + recent copy activity.
 *
 * The signal app never places orders into a broker itself: settings here decide
 * WHAT gets copied, and the subscriber's own terminal (an ATAS/NinjaTrader
 * strategy) collects the queued orders and places them through the broker it is
 * already connected to. We never hold broker credentials. */

const MODES: { value: CopyMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Signals only — nothing is traded for you." },
  { value: "confirm", label: "Confirm each", hint: "An order is prepared; you approve it before it goes out." },
  { value: "auto", label: "Automatic", hint: "Orders are queued for your terminal without asking." },
];

const STATUS_TONE: Record<string, "long" | "short" | "warning" | "neutral" | "info"> = {
  PLACED: "long",
  QUEUED: "info",
  PENDING_CONFIRM: "warning",
  REJECTED: "short",
  ABANDONED: "short",
  SKIPPED: "neutral",
  EXPIRED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  PLACED: "Placed",
  QUEUED: "Waiting for your terminal",
  PENDING_CONFIRM: "Needs your approval",
  REJECTED: "Rejected",
  ABANDONED: "Unconfirmed",
  SKIPPED: "Skipped",
  EXPIRED: "Expired",
};

export default function AutomationPage() {
  const [settings, setSettings] = useState<CopySettings | null>(null);
  const [orders, setOrders] = useState<CopyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const [s, o] = await Promise.all([api.copySettings(token), api.copyOrders(token).catch(() => [])]);
      setSettings(s);
      setOrders(o);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (next: CopySettings) => {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setSettings(await api.updateCopySettings(token, next));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      // Revert on failure — the server may refuse (e.g. copying disabled
      // server-wide), and leaving the toggle showing "Automatic" would tell the
      // user their trades are being placed when they are not.
      setError((e as Error).message);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const patch = (p: Partial<CopySettings>) => { if (settings) void save({ ...settings, ...p }); };

  if (loading) return <div className="py-16 text-center text-sm text-muted">Loading…</div>;
  if (!settings) return <div className="py-16 text-center text-sm text-muted">{error ?? "Could not load settings."}</div>;

  const on = settings.mode !== "off";

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Automation</h1>
        {on
          ? <Badge tone={settings.mode === "auto" ? "long" : "warning"}>{settings.mode === "auto" ? "Active" : "Confirm mode"}</Badge>
          : <Badge tone="neutral">Off</Badge>}
        {saving && <span className="text-xs text-muted">Saving…</span>}
        {saved && <span className="text-xs text-long">Saved</span>}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-short/40 bg-short/10 px-3 py-2 text-sm text-short">{error}</div>
      )}

      <Card className="mb-4 p-5">
        <div className="text-sm font-medium">Auto-copy signals</div>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Copy signals into your own trading platform. Orders are queued for your terminal, which places them through
          the broker you&apos;ve already connected — we never see or hold your broker login.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => patch({ mode: m.value })}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition",
                settings.mode === m.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface-2 hover:bg-surface-3",
              )}
            >
              <div className="text-sm font-medium">{m.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted">{m.hint}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className={cn("mb-4 p-5 transition", !on && "opacity-50")}>
        <div className="text-sm font-medium">Rules</div>
        <p className="mt-1 text-sm text-muted">Only signals matching all of these are copied.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Contracts per signal" value={settings.quantity} min={1} max={100} disabled={!on}
            onChange={(v) => patch({ quantity: v })} />
          <NumberField label="Min. conviction" value={settings.minConviction} min={1} max={4} disabled={!on}
            onChange={(v) => patch({ minConviction: v })} />
          <NumberField label="Max open at once" value={settings.maxConcurrent} min={1} max={50} disabled={!on}
            onChange={(v) => patch({ maxConcurrent: v })} />
          <NumberField label="Max per day" value={settings.maxPerDay} min={1} max={200} disabled={!on}
            onChange={(v) => patch({ maxPerDay: v })} />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 text-[11px] text-muted">
            Markets {settings.markets.length === 0 && <span className="text-muted-2">· all</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MARKETS.map((m) => {
              const active = settings.markets.includes(m);
              return (
                <button
                  key={m}
                  disabled={!on}
                  onClick={() => patch({ markets: active ? settings.markets.filter((x) => x !== m) : [...settings.markets, m] })}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed",
                    active ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted hover:text-foreground",
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          Copy activity <span className="text-muted">({orders.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <Th>Market</Th><Th>Side</Th><Th className="text-right">Qty</Th>
                <Th>Status</Th><Th>Detail</Th><Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border/60 hover:bg-surface-2">
                  <Td className="font-medium">{o.symbol}</Td>
                  <Td>
                    <span className={cn("font-medium", o.side === "LONG" ? "text-long" : "text-short")}>
                      {o.side === "LONG" ? "Long" : "Short"}
                    </span>
                  </Td>
                  <Td className="nums text-right">{o.quantity}</Td>
                  <Td><Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{STATUS_LABEL[o.status] ?? o.status}</Badge></Td>
                  <Td className="max-w-xs truncate text-muted-2" title={o.reason ?? undefined}>{o.reason ?? "—"}</Td>
                  <Td className="nums text-muted">{timeAgo(o.createdAt)}</Td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">
                    {on ? "No copied orders yet." : "Automation is off — turn it on to start copying signals."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-3 text-xs text-muted-2">
        Copying follows your subscription access — you can only auto-trade signals you can see.
      </p>
    </div>
  );
}

function NumberField({ label, value, min, max, disabled, onChange }: {
  label: string; value: number; min: number; max: number; disabled?: boolean; onChange: (v: number) => void;
}) {
  // Local draft so typing doesn't fire a save per keystroke; committed on blur.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = Math.min(Math.max(Math.floor(Number(draft)), min), max);
    if (Number.isFinite(n) && n !== value) onChange(n);
    else setDraft(String(value));
  };
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <input
        type="number" inputMode="numeric" min={min} max={max} value={draft} disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 font-medium", className)}>{children}</th>;
}
function Td({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={cn("px-4 py-2.5", className)} title={title}>{children}</td>;
}
