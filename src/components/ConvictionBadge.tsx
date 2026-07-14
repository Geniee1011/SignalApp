import { cn } from "@/lib/utils";

/* Conviction = the trader's risk phase (1-4). 1 green → 4 red. */
const COLORS: Record<number, string> = { 1: "#16c784", 2: "#f0b90b", 3: "#f97316", 4: "#ea3943" };

export function convictionColor(level: number): string {
  return COLORS[level] ?? "#8a97ad";
}

export function ConvictionBadge({ level, showLabel = false, className }: { level: number; showLabel?: boolean; className?: string }) {
  const color = convictionColor(level);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`Conviction ${level}`}>
      <span
        className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold nums"
        style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
      >
        {level}
      </span>
      {showLabel && <span className="text-xs text-muted">conviction</span>}
    </span>
  );
}
