import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  // Tailwind v4 dropped the Preflight rule that gave `button` a pointer cursor,
  // so every button has to opt back in. It belongs here rather than at each call
  // site: a variant is the only thing every button in the app shares.
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium text-sm tracking-tightish outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
  {
    variants: {
      variant: {
        // Primary CTA — glossy dark on light, inverts to light-raised in .zone-dark.
        default: "btn-glossy border-transparent",
        // Alias kept so existing `variant="glossy"` callers keep working.
        glossy: "btn-glossy border-transparent",
        // Spark Orange — the single most important action, same glossy physics.
        spark: "btn-glossy-spark border-transparent",
        // Spark Orange with no gloss, shadow, or gradient — brand weight where
        // raised physics would compete with a flat field beside it.
        "spark-flat":
          "btn-press border-transparent bg-spark text-white hover:bg-spark/90",
        // Crisp flat secondary — firm hairline + faint contact lift beside the CTA.
        ghost:
          "btn-press border border-line2 bg-card text-foreground shadow-raised hover:bg-accent",
        // Borderless — quiet tertiary actions (stays flat, no lift).
        subtle:
          "btn-press border border-transparent bg-transparent text-muted2 hover:bg-accent hover:text-foreground",
        outline:
          "btn-press border border-input bg-background shadow-raised hover:bg-accent hover:text-accent-foreground",
        secondary:
          "btn-press border border-line2 bg-secondary text-secondary-foreground shadow-raised hover:bg-accent",
        // Raised destructive — same contact-lift physics as ghost, tinted red.
        destructive:
          "btn-press border border-destructive/35 bg-card text-destructive shadow-raised hover:bg-destructive/10",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5",
        default: "h-10 px-4 has-[>svg]:px-3.5",
        lg: "h-11 px-5 has-[>svg]:px-4",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
