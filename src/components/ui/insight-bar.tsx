import type * as React from "react";

import { cn } from "./utils";

type Tone = "spark" | "mint" | "amber" | "peri";

const TONE: Record<Tone, { wrap: string; chip: string }> = {
  spark: {
    wrap: "border-spark/30 bg-spark/5",
    chip: "bg-spark/12 text-spark",
  },
  mint: {
    wrap: "border-mint/30 bg-mint/5",
    chip: "bg-mint/12 text-mint",
  },
  amber: {
    wrap: "border-amber-fill/40 bg-amber-fill/8",
    chip: "bg-amber-fill/18 text-amber",
  },
  peri: {
    wrap: "border-peri/30 bg-peri/5",
    chip: "bg-peri/12 text-peri",
  },
};

/**
 * The insight-first banner: one plain-language takeaway + the single best next
 * action. Lead each screen with this, never a wall of metrics. Pass a Lucide
 * icon as `icon` and the CTA as `action`.
 */
function InsightBar({
  tone = "spark",
  icon,
  action,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  tone?: Tone;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const t = TONE[tone] ?? TONE.spark;

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-card border p-4 [&_svg]:size-[18px]",
        t.wrap,
        className
      )}
      data-slot="insight-bar"
      {...props}
    >
      {icon ? (
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-md",
            t.chip
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="flex-1 text-[14.5px] text-cream leading-snug tracking-tightish">
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export { InsightBar };
