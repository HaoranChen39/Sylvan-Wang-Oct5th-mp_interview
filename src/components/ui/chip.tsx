import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "./utils";

type Tone = "neutral" | "spark" | "acid" | "mint" | "peri" | "amber";
type Variant = "soft" | "solid" | "outline";
type Size = "sm" | "md" | "lg";

/** Tone → brand token classes per variant. Colors come from the data palette
 * (spark/acid/mint/peri/amber) + the neutral canvas; never raw Tailwind hues. */
const TONE: Record<
  Tone,
  { soft: string; solid: string; outline: string; dot: string }
> = {
  neutral: {
    soft: "border-line2 bg-canvas text-muted2",
    solid: "border-transparent bg-muted2 text-ink",
    outline: "border-line2 bg-transparent text-muted2",
    dot: "bg-muted2",
  },
  spark: {
    soft: "border-spark/35 bg-spark/6 text-spark",
    solid: "border-transparent bg-spark text-ink",
    outline: "border-spark/45 bg-transparent text-spark",
    dot: "bg-spark",
  },
  acid: {
    soft: "border-acid/35 bg-acid/6 text-acid",
    solid: "border-transparent bg-acid text-ink",
    outline: "border-acid/45 bg-transparent text-acid",
    dot: "bg-acid",
  },
  mint: {
    soft: "border-mint/35 bg-mint/6 text-mint",
    solid: "border-transparent bg-mint text-ink",
    outline: "border-mint/45 bg-transparent text-mint",
    dot: "bg-mint",
  },
  peri: {
    soft: "border-peri/35 bg-peri/6 text-peri",
    solid: "border-transparent bg-peri text-ink",
    outline: "border-peri/45 bg-transparent text-peri",
    dot: "bg-peri",
  },
  amber: {
    soft: "border-amber/35 bg-amber/6 text-amber",
    solid: "border-transparent bg-amber-fill text-ink",
    outline: "border-amber/45 bg-transparent text-amber",
    dot: "bg-amber",
  },
};

const SIZE: Record<Size, string> = {
  sm: "h-5 gap-1 px-2 text-[10px]",
  md: "h-6 gap-1.5 px-2.5 text-[11px]",
  lg: "h-7 gap-1.5 px-3 text-xs",
};

/**
 * Small mono pill for tags, filters, and metadata. Tones tint the
 * border/background/text from the brand data colors. Choose a `variant`
 * (soft tint, solid fill, or outline), a `size`, an optional leading `dot`
 * or `icon`, and an optional `onClose` to render a dismiss button.
 */
function Chip({
  tone = "neutral",
  variant = "soft",
  size = "md",
  dot = false,
  icon,
  onClose,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  tone?: Tone;
  variant?: Variant;
  size?: Size;
  dot?: boolean;
  icon?: React.ReactNode;
  onClose?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const t = TONE[tone] ?? TONE.neutral;

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-badge border font-mono leading-none transition-colors",
        SIZE[size],
        t[variant],
        className
      )}
      data-slot="chip"
      {...props}
    >
      {dot ? (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", t.dot)}
          data-slot="chip-dot"
        />
      ) : null}
      {icon ? (
        <span
          className="flex shrink-0 items-center [&_svg]:size-3.5"
          data-slot="chip-icon"
        >
          {icon}
        </span>
      ) : null}
      {children}
      {onClose ? (
        <button
          aria-label="Remove"
          className="-mr-0.5 flex shrink-0 items-center rounded-pill opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
          data-slot="chip-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export { Chip };
