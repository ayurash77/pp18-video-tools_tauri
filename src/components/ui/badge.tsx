import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]",
        outline:
          "border-[var(--border)] text-[var(--foreground)]",
        success:
          "border-[color-mix(in_oklch,var(--status-done-bg),var(--status-done-fg)_25%)] bg-[var(--status-done-bg)] text-[var(--status-done-fg)]",
        active:
          "border-[color-mix(in_oklch,var(--status-active-bg),var(--status-active-fg)_25%)] bg-[var(--status-active-bg)] text-[var(--status-active-fg)]",
        warning:
          "border-[color-mix(in_oklch,var(--destructive),var(--destructive-foreground)_20%)] bg-[color-mix(in_oklch,var(--destructive),transparent_58%)] text-[var(--destructive-foreground)]",
        muted:
          "border-transparent bg-[var(--muted)] text-[color-mix(in_oklch,var(--muted-foreground),white_12%)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
