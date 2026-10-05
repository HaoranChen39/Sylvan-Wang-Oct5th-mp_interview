import type * as React from "react";

import { cn } from "./utils";

type DeltaTone = "mint" | "danger" | "spark" | "muted";

const VALUE_SIZE = {
  sm: "text-[22px]",
  md: "text-[28px]",
  lg: "text-[40px]",
} as const;

const DELTA_TONE: Record<DeltaTone, string> = {
  mint: "text-mint",
  danger: "text-danger",
  spark: "text-spark",
  muted: "text-muted-foreground",
};

/** Infer tone from the delta's sign: + up (mint), - down (danger), else muted. */
function inferDeltaTone(delta?: string): DeltaTone {
  const trimmed = delta?.trim();
  if (trimmed?.startsWith("-")) {
    return "danger";
  }
  if (trimmed?.startsWith("+")) {
    return "mint";
  }
  return "muted";
}

/**
 * A single KPI: a mono tabular value, a mono uppercase label, an optional
 * directional delta, and an optional sub line. Numbers always tabular-nums.
 */
function Stat({
  value,
  label,
  sub,
  delta,
  deltaTone,
  size = "md",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  value: React.ReactNode;
  label: React.ReactNode;
  sub?: React.ReactNode;
  delta?: string;
  deltaTone?: DeltaTone;
  size?: "sm" | "md" | "lg";
}) {
  const tone: DeltaTone = deltaTone ?? inferDeltaTone(delta);

  return (
    <div className={cn("flex flex-col", className)} data-slot="stat" {...props}>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-medium font-mono text-cream tabular-nums leading-none tracking-tighter2",
            VALUE_SIZE[size]
          )}
        >
          {value}
        </span>
        {delta ? (
          <span
            className={cn("font-mono text-xs tabular-nums", DELTA_TONE[tone])}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <span className="mt-2 font-medium font-mono text-[12px] text-muted-foreground uppercase tracking-widest">
        {label}
      </span>
      {sub ? (
        <span className="mt-1.5 font-mono text-[12px] text-muted2">{sub}</span>
      ) : null}
    </div>
  );
}

export { Stat };
