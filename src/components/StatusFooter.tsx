import { List } from "lucide-react";
import { Button } from "./ui/button";

type StatusFooterProps = {
  latestLog?: string;
  onOpenLogs: () => void;
  progressPercent: number;
  statusText: string;
  total: number;
};

export function StatusFooter({
  latestLog,
  onOpenLogs,
  progressPercent,
  statusText,
  total,
}: StatusFooterProps) {
  const progressLabel = total > 0 ? `Прогресс: ${progressPercent}%` : statusText;

  return (
    <footer className="grid min-h-10 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 border-t border-[color-mix(in_oklch,var(--border),transparent_45%)] bg-[color-mix(in_oklch,var(--background),black_6%)] px-3.5">
      <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-[color-mix(in_oklch,var(--muted-foreground),white_8%)]">
        {latestLog ?? statusText}
      </div>
      <div className="grid min-w-0 grid-cols-[auto_112px_30px] items-center gap-2.5">
        <span className="min-w-23 text-right text-[11px] font-bold text-[color-mix(in_oklch,var(--muted-foreground),white_12%)]">
          {progressLabel}
        </span>
        <div
          aria-label={progressLabel}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressPercent}
          className="h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--muted),transparent_20%)]"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-linear-to-r from-[oklch(0.68_0.2_252)] to-[oklch(0.7_0.18_285)]"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <Button
          aria-label="Открыть логи"
          size="icon"
          title="Открыть логи"
          type="button"
          variant="outline"
          onClick={onOpenLogs}
        >
          <List />
        </Button>
      </div>
    </footer>
  );
}
