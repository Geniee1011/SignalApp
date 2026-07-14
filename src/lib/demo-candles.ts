/* ---------------------------------------------------------------------------
 * Synthetic candle generator — DESIGN DEMO ONLY.
 *
 * When the real candle feed returns nothing (e.g. the operator's Databento
 * account is billing-blocked), the chart falls back to this so the Signal App's
 * design is still presentable. It is NOT real market data.
 *
 * Easy to reverse — the feature disappears three ways, cheapest first:
 *   1. It self-reverses: the chart only uses this when the live feed returns
 *      EMPTY. The moment Databento serves real candles again, this is bypassed.
 *   2. Set NEXT_PUBLIC_DEMO_CHART=0 to force it off (blank chart on empty feed).
 *   3. Delete this file + the demo fallback branch in chart/page.tsx.
 *
 * Deterministic per (symbol, resolution) via a seeded PRNG, so the series is
 * identical across reloads and the signal entry/exit markers stay anchored.
 * ------------------------------------------------------------------------- */

import type { Candle } from "./api";

// Plausible 2026 index/commodity levels — only used when there are no real
// signals for the symbol to anchor the series to.
const BASE_PRICE: Record<string, number> = {
  ES: 6300, NQ: 23000, YM: 45000, GC: 3300, CL: 75,
};

/** Mulberry32 — tiny deterministic PRNG (identical output for a given seed). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — string → 32-bit seed, so each symbol/timeframe gets its own walk. */
function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build `count` candles of `resolutionSec` each, ending at "now". `anchorPrice`
 * (e.g. the average real signal entry for the symbol) keeps the demo chart
 * visually coherent with the trades table; falls back to a per-symbol base.
 */
export function generateDemoCandles(
  symbol: string,
  resolutionSec: number,
  count: number,
  anchorPrice?: number,
  nowMs: number = Date.now(),
): Candle[] {
  const base = anchorPrice && anchorPrice > 0 ? anchorPrice : (BASE_PRICE[symbol] ?? 1000);
  const rnd = mulberry32(seedFrom(`${symbol}:${resolutionSec}`));
  const vol = base * 0.0009; // per-bar volatility ≈ 0.09%
  const nowBucket = Math.floor(nowMs / 1000 / resolutionSec) * resolutionSec;
  const out: Candle[] = [];
  let price = base * (0.99 + rnd() * 0.02); // start a touch off the anchor
  for (let i = count - 1; i >= 0; i--) {
    const time = nowBucket - i * resolutionSec;
    // Random step + gentle mean-reversion toward the anchor so a 300-bar walk
    // never drifts implausibly far from a realistic level.
    const drift = (rnd() - 0.5) * vol * 2 + (base - price) * 0.02;
    const open = price;
    const close = Math.max(0.01, open + drift);
    const body = Math.abs(close - open);
    const high = Math.max(open, close) + (body + rnd() * vol) * rnd();
    const low = Math.min(open, close) - (body + rnd() * vol) * rnd();
    out.push({
      time,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +Math.max(0.01, low).toFixed(2),
      close: +close.toFixed(2),
      volume: Math.round(120 + rnd() * 880),
    });
    price = close;
  }
  return out;
}
