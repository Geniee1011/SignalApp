"use client";

import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface", className)}>{children}</div>;
}

type Tone = "neutral" | "long" | "short" | "warning" | "info" | "primary";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted",
  long: "bg-long/15 text-long",
  short: "bg-short/15 text-short",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
  primary: "bg-primary/15 text-primary",
};

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", TONE[tone], className)}>{children}</span>;
}

export function Button({
  children, onClick, type = "button", variant = "primary", size = "md", disabled, loading, className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-hover",
    secondary: "border border-border bg-surface-2 text-foreground hover:bg-surface-3",
    danger: "bg-short/90 text-white hover:bg-short",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        variants[variant],
        className,
      )}
    >
      {loading ? "…" : children}
    </button>
  );
}

export function Field({ label, type = "text", value, onChange, placeholder }: { label: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
      />
    </label>
  );
}

export function Stat({ label, value, tone = "neutral", sub }: { label: string; value: React.ReactNode; tone?: "neutral" | "long" | "short" | "warning"; sub?: string }) {
  const color = tone === "long" ? "text-long" : tone === "short" ? "text-short" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold nums", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-2">{sub}</div>}
    </Card>
  );
}
