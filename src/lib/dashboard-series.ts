/* ---------------------------------------------------------------------------
 * Dashboard "Live Range" series — price line + conviction oscillator.
 *
 * There's no real per-minute conviction feed, and the price feed is billing-
 * blocked, so this generates a smooth, deterministic curve per (symbol, range)
 * for the design. The oscillator centres on the market's REAL conviction value
 * (from /api/dashboard) so the chart, the cards, and the gauge all agree.
 *
 * Deterministic (seeded) → stable across reloads. Delete this file + its use in
 * the dashboard page to remove; nothing else depends on it.
 * ------------------------------------------------------------------------- */

const BASE_PRICE: Record<string, number> = { ES: 6300, NQ: 23000, YM: 45000, GC: 3300, CL: 75 };

export interface RangeKey {
  label: string;
  points: number; // samples across the window
  stepMs: number; // spacing between samples
}

export const RANGES: RangeKey[] = [
  { label: "24H", points: 96, stepMs: 15 * 60_000 },
  { label: "7D", points: 84, stepMs: 2 * 3_600_000 },
  { label: "30D", points: 90, stepMs: 8 * 3_600_000 },
  { label: "90D", points: 90, stepMs: 24 * 3_600_000 },
];

export interface SeriesPoint {
  t: number; // epoch ms
  price: number;
  conviction: number; // 0-100
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Build a price + conviction series for one market/range. `conviction` is the
 * real 0-100 value the oscillator oscillates around; `anchorPrice` (e.g. a real
 * signal entry) keeps the price line at a believable level.
 */
export function buildSeries(
  symbol: string,
  range: RangeKey,
  conviction: number,
  anchorPrice?: number,
  nowMs: number = Date.now(),
): SeriesPoint[] {
  const base = anchorPrice && anchorPrice > 0 ? anchorPrice : (BASE_PRICE[symbol] ?? 1000);
  const rnd = mulberry32(seedFrom(`${symbol}:${range.label}`));
  const vol = base * 0.0016;
  const out: SeriesPoint[] = [];
  let price = base * (0.994 + rnd() * 0.012);
  let conv = conviction;
  // Two blended sine waves give the oscillator its irregular, lively shape.
  const w1 = 0.35 + rnd() * 0.25;
  const w2 = 0.11 + rnd() * 0.09;
  const phase = rnd() * Math.PI * 2;
  const amp = clamp(18 + conviction * 0.18, 12, 34); // swing amplitude around centre

  for (let i = 0; i < range.points; i++) {
    const t = nowMs - (range.points - 1 - i) * range.stepMs;
    // Price: mean-reverting random walk around the anchor.
    price += (rnd() - 0.5) * vol * 2 + (base - price) * 0.03;
    // Conviction oscillator: sine blend + noise, gently pulled toward the centre.
    const wave = Math.sin(i * w1 + phase) * amp + Math.sin(i * w2) * amp * 0.5;
    conv += (conviction - conv) * 0.12 + (rnd() - 0.5) * 6;
    const value = clamp(conv + wave, 2, 99);
    out.push({ t, price: +price.toFixed(symbol === "CL" ? 2 : 2), conviction: Math.round(value) });
  }
  // Land the final sample on the exact card/gauge conviction so they agree visually.
  if (out.length) out[out.length - 1]!.conviction = Math.round(clamp(conviction, 2, 99));
  return out;
}
