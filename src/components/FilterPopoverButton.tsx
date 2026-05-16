import { useState } from "react";
import { Funnel } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "../lib/utils";

type FilterOption = {
  value: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

type FilterGroup = {
  title: string;
  options: FilterOption[];
  emptyLabel?: string;
};

type FilterPopoverButtonProps = {
  label: string;
  active: boolean;
  groups: FilterGroup[];
  resetLabel?: string;
  onReset?: () => void;
  align?: "start" | "center" | "end";
};

const optionClassName =
  "focus-within:text-accent-foreground flex w-full cursor-pointer items-center gap-1 py-0.5 text-sm transition";

export function FilterPopoverButton({
  label,
  active,
  groups,
  resetLabel,
  onReset,
  align = "end",
}: FilterPopoverButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={label}
          className={active ? "toolbarActive" : ""}
          size="icon"
          title={label}
          type="button"
          variant={active ? "secondary" : "outline"}
        >
          <Funnel className="p-px" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={8} className="w-auto bg-popover/70 shadow-xl">
        <div className="flex flex-col gap-3">
          <div className="grid grid-flow-col auto-cols-max gap-4 overflow-x-auto">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-1">
                <div className="text-xs font-bold text-muted-foreground">{group.title}</div>
                <div>
                  {group.options.length === 0 ? (
                    <div className="py-1.5 text-xs text-muted-foreground">{group.emptyLabel}</div>
                  ) : (
                    group.options.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          optionClassName,
                          option.checked ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Checkbox
                          checked={option.checked}
                          className="m-1 scale-90"
                          onCheckedChange={(value) => option.onChange(value === true)}
                        />
                        <span className="min-w-fit truncate">{option.label}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
          {resetLabel && onReset ? (
            <div className="flex justify-center border-t border-border pt-3 pb-0">
              <Button
                aria-label={resetLabel}
                disabled={!active}
                size="sm"
                title={resetLabel}
                type="button"
                variant="default"
                onClick={onReset}
              >
                {resetLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
