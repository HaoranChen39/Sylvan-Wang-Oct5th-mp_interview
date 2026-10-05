import type * as React from "react";

import { cn } from "./utils";

type Status =
  | "serving"
  | "pending"
  | "paused"
  | "failed"
  | "rejected"
  | "launching"
  | "completed"
  | "draft";

const STATUS: Record<Status, { wrap: string; label: string }> = {
  serving: {
    wrap: "border-mint/40 bg-mint/10 text-mint",
    label: "Serving",
  },
  pending: {
    wrap: "border-amber-fill/50 bg-amber-fill/15 text-amber",
    label: "Pending review",
  },
  paused: {
    wrap: "border-line2 bg-canvas text-muted-foreground",
    label: "Paused",
  },
  failed: {
    wrap: "border-danger/40 bg-danger/10 text-danger",
    label: "Failed",
  },
  rejected: {
    wrap: "border-danger/40 bg-danger/10 text-danger",
    label: "Rejected",
  },
  launching: {
    wrap: "border-spark/40 bg-spark/10 text-spark",
    label: "Launching",
  },
  completed: {
    wrap: "border-peri/40 bg-peri/10 text-peri",
    label: "Completed",
  },
  draft: {
    wrap: "border-line2 bg-canvas text-muted-foreground",
    label: "Draft",
  },
};

/**
 * The signature campaign-state motif: a tinted full-pill badge with an
 * uppercase mono label — the tint and the label color carry the state on
 * their own. serving→mint · pending→amber · paused/draft→gray ·
 * failed/rejected→red · launching→spark.
 */
function StatusBadge({
  status = "serving",
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  status?: Status;
  label?: React.ReactNode;
}) {
  const s = STATUS[status] ?? STATUS.draft;

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-badge border px-2.5 font-mono text-[11px] uppercase leading-none tracking-[0.06em]",
        s.wrap,
        className
      )}
      data-slot="status-badge"
      data-status={status}
      {...props}
    >
      {label ?? s.label}
    </span>
  );
}

export { StatusBadge };
