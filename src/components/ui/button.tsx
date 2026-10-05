import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

import { buttonVariants } from "./button-variants";
import { cn } from "./utils";

/**
 * The product version also supports `asChild` through Radix Slot. Dropped
 * here to keep the sandbox dependency-light.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      type={type}
      {...props}
    />
  );
}

export { Button };
