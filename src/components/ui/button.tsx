import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold outline-none transition-all duration-150 active:scale-[0.98] active:opacity-70 disabled:pointer-events-none disabled:opacity-50 focus-visible:border-[var(--ring)] focus-visible:ring-3 focus-visible:ring-[color-mix(in_oklch,var(--ring),transparent_52%)] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[color-mix(in_oklch,var(--primary),white_18%)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:brightness-120",
        outline:
          "border border-[color-mix(in_oklch,var(--muted-foreground),transparent_80%)] bg-[var(--input)] text-[var(--foreground)] shadow-sm hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
        ghost:
          "border border-transparent bg-transparent text-[color-mix(in_oklch,var(--muted-foreground),white_15%)] hover:bg-[color-mix(in_oklch,var(--accent),transparent_30%)] hover:text-[var(--accent-foreground)]",
        destructive:
          "border border-[color-mix(in_oklch,var(--destructive),var(--destructive-foreground)_20%)] bg-[var(--destructive)] text-[var(--destructive-foreground)] shadow-sm hover:brightness-120",
      },
      size: {
        default: "h-[30px] px-3 py-1",
        sm: "h-[26px] rounded-sm px-2.5 py-0.5 text-xs",
        icon: "size-[30px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
