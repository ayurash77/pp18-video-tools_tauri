import * as React from "react";
import { cn } from "../../lib/utils";

type CheckboxProps = React.ComponentProps<"input">;

function Checkbox({ className, ...props }: CheckboxProps) {
  return <input {...props} className={cn("ui-checkbox", className)} type="checkbox" />;
}

export { Checkbox };
