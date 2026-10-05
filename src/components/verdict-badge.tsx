import { UserRound } from "lucide-react";
import type * as React from "react";

import type { HumanDecision } from "../lib/decisions";
import type { ReviewVerdict } from "../lib/moderation";
import { cn } from "./ui/utils";

/**
 * Why not reuse StatusBadge?
 *
 * StatusBadge is typed to campaign states. We could fake it
 * (`<StatusBadge status="rejected" label="Block" />`), but then a moderation
 * verdict is stored as a campaign state: `data-status="serving"` on an allowed
 * profile is a lie, and any future change to what "serving" looks like (a live
 * pulse, say) would silently leak into the review queue.
 *
 * Widening StatusBadge's union instead mixes two domains in a shared
 * primitive. So this is a sibling: same visual motif (squared tinted badge,
 * mono uppercase), same data-palette meaning (mint good, amber attention,
 * danger stopped), its own typed vocabulary. If a third domain shows up, that
 * is the moment to extract a tone-only `Badge` primitive both can wrap.
 */

const BASE =
  "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-badge border px-2.5 font-mono text-[11px] uppercase leading-none tracking-[0.06em]";

const TONE = {
  mint: "border-mint/40 bg-mint/10 text-mint",
  amber: "border-amber-fill/50 bg-amber-fill/15 text-amber",
  danger: "border-danger/40 bg-danger/10 text-danger",
} as const;

const VERDICT: Record<ReviewVerdict, { tone: keyof typeof TONE; label: string }> = {
  allow: { tone: "mint", label: "Allow" },
  review: { tone: "amber", label: "Review" },
  block: { tone: "danger", label: "Block" },
};

const DECISION: Record<HumanDecision, { tone: keyof typeof TONE; label: string }> = {
  allowed: { tone: "mint", label: "Allowed" },
  blocked: { tone: "danger", label: "Blocked" },
};

type SpanProps = Omit<React.ComponentProps<"span">, "children">;

/** The machine's verdict. Outlined-tint, like every machine signal. */
export function VerdictBadge({
  verdict,
  className,
  ...props
}: SpanProps & { verdict: ReviewVerdict }) {
  const v = VERDICT[verdict];
  return (
    <span
      className={cn(BASE, TONE[v.tone], className)}
      data-slot="verdict-badge"
      data-verdict={verdict}
      {...props}
    >
      {v.label}
    </span>
  );
}

/**
 * A human decision. Same tones, plus a person glyph so "Allowed by a human"
 * never reads as the machine's "Allow" when both sit side by side.
 */
export function DecisionBadge({
  decision,
  className,
  ...props
}: SpanProps & { decision: HumanDecision }) {
  const d = DECISION[decision];
  return (
    <span
      className={cn(BASE, TONE[d.tone], className)}
      data-decision={decision}
      data-slot="decision-badge"
      {...props}
    >
      <UserRound aria-hidden className="size-3" />
      {d.label}
    </span>
  );
}
