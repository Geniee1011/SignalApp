"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* Calendar range picker — presets + a two-month grid. Self-contained (no date lib).
 * All bounds are LOCAL days: `from` is 00:00:00.000, `to` is 23:59:59.999, so a
 * single-day pick covers that whole day. null = unbounded on that side. */

export interface DateRange {
  from: number | null; // start-of-day ms; null = since the beginning
  to: number | null; // end-of-day ms; null = through now
}

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const endOfDay = (d: Date) => startOfDay(d) + DAY - 1;
const lastDays = (n: number): DateRange => ({ from: startOfDay(new Date(Date.now() - (n - 1) * DAY)), to: endOfDay(new Date()) });

export const ALL_TIME: DateRange = { from: null, to: null };

const PRESETS: { label: string; range: () => DateRange }[] = [
  { label: "Last 7 days", range: () => lastDays(7) },
  { label: "Last 30 days", range: () => lastDays(30) },
  { label: "Last 90 days", range: () => lastDays(90) },
  { label: "Year to date", range: () => ({ from: startOfDay(new Date(new Date().getFullYear(), 0, 1)), to: endOfDay(new Date()) }) },
  { label: "All time", range: () => ALL_TIME },
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Mar 4" — with the year appended only when it isn't the current one. */
function fmtDay(ms: number): string {
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

export function rangeLabel(r: DateRange): string {
  if (r.from == null && r.to == null) return "All time";
  if (r.from == null) return `Up to ${fmtDay(r.to!)}`;
  if (r.to == null) return `${fmtDay(r.from)} – now`;
  if (startOfDay(new Date(r.from)) === startOfDay(new Date(r.to))) return fmtDay(r.from);
  return `${fmtDay(r.from)} – ${fmtDay(r.to)}`;
}

const eq = (a: DateRange, b: DateRange) => a.from === b.from && a.to === b.to;

/** Day cells for a month, padded with leading nulls so the 1st lands on its weekday. */
function monthCells(year: number, month: number): (number | null)[] {
  const lead = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= count; d++) cells.push(startOfDay(new Date(year, month, d)));
  return cells;
}

/** One month grid. Declared at module scope — nesting it inside the picker would
 *  mint a new component type per render and remount the grid on every hover. */
function MonthGrid({ year, month, today, selFrom, selTo, drawing, onPick, onHover, className }: {
  year: number;
  month: number;
  today: number;
  selFrom: number | null;
  selTo: number | null;
  drawing: boolean;
  onPick: (ms: number) => void;
  onHover: (ms: number) => void;
  className?: string;
}) {
  const from = selFrom != null ? startOfDay(new Date(selFrom)) : null;
  const to = selTo != null ? startOfDay(new Date(selTo)) : null;
  return (
    <div className={className}>
      <div className="mb-2 text-center text-xs font-medium">{MONTHS[month]} {year}</div>
      <div className="mb-1 grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((w, i) => <div key={i} className="text-center text-[10px] text-muted-2">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {monthCells(year, month).map((ms, i) => {
          if (ms == null) return <div key={i} />;
          const future = ms > today;
          const isFrom = from != null && ms === from;
          const isTo = to != null && ms === to;
          const edge = isFrom || isTo;
          const inRange = from != null && to != null && ms > from && ms < to;
          return (
            <div
              key={i}
              className={cn(
                inRange && "bg-primary/10",
                isFrom && to != null && !isTo && "rounded-l-full bg-primary/10",
                isTo && from != null && !isFrom && "rounded-r-full bg-primary/10",
              )}
            >
              <button
                type="button"
                disabled={future}
                onClick={() => onPick(ms)}
                onMouseEnter={() => { if (drawing) onHover(ms); }}
                className={cn(
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs nums transition",
                  future && "cursor-not-allowed text-muted-2/40",
                  edge && "bg-primary font-semibold text-white",
                  !future && !edge && "hover:bg-surface-3",
                  !future && !edge && inRange && "text-primary",
                  !future && !edge && !inRange && ms === today && "font-semibold text-primary",
                )}
              >
                {new Date(ms).getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(null); // first click of an in-progress range
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Show the month the range ends in on the right, its predecessor on the left.
  const [view, setView] = useState(() => {
    const d = new Date(value.to ?? Date.now());
    return { y: d.getFullYear(), m: d.getMonth() - 1 };
  });

  // Close on outside click / Escape, and drop any half-finished selection.
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setAnchor(null); setHover(null); };
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const today = startOfDay(new Date());

  // While a range is being drawn, preview it; otherwise reflect the committed value.
  const [selFrom, selTo] = useMemo(() => {
    if (anchor == null) return [value.from, value.to];
    const other = hover ?? anchor;
    return [Math.min(anchor, other), Math.max(anchor, other)];
  }, [anchor, hover, value]);

  const pick = (ms: number) => {
    if (anchor == null) { setAnchor(ms); setHover(ms); return; }
    onChange({ from: Math.min(anchor, ms), to: endOfDay(new Date(Math.max(anchor, ms))) });
    setAnchor(null); setHover(null); setOpen(false);
  };

  const applyPreset = (r: DateRange) => {
    onChange(r);
    const d = new Date(r.to ?? Date.now());
    setView({ y: d.getFullYear(), m: d.getMonth() - 1 });
    setAnchor(null); setHover(null); setOpen(false);
  };

  const shift = (by: number) => setView((v) => {
    const d = new Date(v.y, v.m + by, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // Cap on the RIGHT month, which is the one shown on narrow screens: paging past
  // the current month would only reveal a fully-disabled future grid.
  const rightMonth = new Date(view.y, view.m + 1, 1).getTime();
  const atMax = rightMonth >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none transition hover:bg-surface-2",
          open && "border-primary",
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-muted">
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9.5h18M8 2.5v4M16 2.5v4" strokeLinecap="round" />
        </svg>
        <span className="font-medium">{rangeLabel(value)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn("h-3 w-3 text-muted transition", open && "rotate-180")}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 flex gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-xl">
          <div className="flex w-28 shrink-0 flex-col gap-0.5 border-r border-border pr-3">
            {PRESETS.map((p) => {
              const active = eq(p.range(), value);
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.range())}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-left text-xs transition",
                    active ? "bg-primary/15 font-medium text-primary" : "text-muted hover:bg-surface-3 hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <button type="button" onClick={() => shift(-1)} className="rounded-md p-1 text-muted transition hover:bg-surface-3 hover:text-foreground">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <span className="text-[10px] text-muted-2">{anchor != null ? "Pick the end date" : "Pick a start date"}</span>
              <button type="button" onClick={() => shift(1)} disabled={atMax} className="rounded-md p-1 text-muted transition hover:bg-surface-3 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <div className="flex gap-4">
              {[0, 1].map((offset) => {
                const d = new Date(view.y, view.m + offset, 1);
                return (
                  <MonthGrid
                    key={offset}
                    year={d.getFullYear()}
                    month={d.getMonth()}
                    today={today}
                    selFrom={selFrom}
                    selTo={selTo}
                    drawing={anchor != null}
                    onPick={pick}
                    onHover={setHover}
                    // Narrow screens show only the month the range ends in.
                    className={cn("w-[196px]", offset === 0 && "hidden sm:block")}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
