import * as React from "react";
import { cn } from "../../lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        className={cn(
          "h-[30px] w-full min-w-0 rounded-md border border-[var(--border)] bg-[color-mix(in_oklch,var(--background),transparent_70%)] px-3 py-1 text-sm text-[var(--foreground)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted-foreground)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-[var(--ring)] focus-visible:shadow-[var(--focus-shadow)]",
          className,
        )}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
