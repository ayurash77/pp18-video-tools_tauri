import * as React from "react";
import { cn } from "../../lib/utils";

type PanelVariant = "default" | "ghost" | "outline";

type PanelProps = React.ComponentProps<"section"> & {
  variant?: PanelVariant;
};

function Panel({ className, variant = "default", ...props }: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border-bright)] bg-[color-mix(in_oklch,var(--card),transparent_3%)] shadow-[var(--shadow-panel)]",
        variant === "ghost" && "border-transparent bg-transparent shadow-none",
        variant === "outline" && "bg-transparent shadow-none",
        className,
      )}
      {...props}
    />
  );
}

export { Panel };
