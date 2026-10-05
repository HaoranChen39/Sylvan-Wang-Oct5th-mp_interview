import type * as React from "react";

import { cn } from "./utils";

type Tone = "muted" | "spark" | "acid" | "mint" | "peri";

const TONE: Record<Tone, string> = {
  muted: "text-muted-foreground",
  spark: "text-spark",
  acid: "text-acid",
  mint: "text-mint",
  peri: "text-peri",
};

/**
 * Mono uppercase kicker that labels sections and cards. No leading rule —
 * just the wide-tracked machine-voice label.
 */
function Eyebrow({
  tone = "muted",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium font-mono text-[11px] uppercase tracking-eyebrow",
        TONE[tone],
        className
      )}
      data-slot="eyebrow"
      {...props}
    />
  );
}

export { Eyebrow };
