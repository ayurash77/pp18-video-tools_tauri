import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-[background-color,color,border-color,box-shadow,opacity] " +
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none " +
    "[&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring " +
    "focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive " +
    "active:opacity-[0.6] duration-150",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:brightness-120 shadow-sm",
        outline:
          "border border-muted-foreground/20 bg-input hover:bg-accent hover:text-accent-foreground shadow-sm",
        secondary:
          "bg-secondary text-secondary-foreground hover:brightness-120 shadow-sm",
        ghost:
          "text-muted-foreground/80 hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:brightness-120 shadow-sm focus-visible:ring-destructive-foreground/40",
      },
      size: {
        default: "h-7.5 px-3 py-0.5 has-[>svg]:px-3",
        sm: "h-6.5 rounded-sm gap-1.5 px-2.5 has-[>svg]:px-2.5",
        lg: "h-9 rounded-md px-5 has-[>svg]:px-4",
        icon: "size-7.5",
        "icon-sm": "size-6.5 rounded-sm",
        "icon-lg": "size-9",
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
