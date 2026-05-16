import { useState, type ReactNode } from "react";
import { BugOff, ExternalLink, Eye, FolderOpen, Play, Send, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu";

export type VideoTaskLine = {
  label: "src" | "fixes" | "preview";
  text: string;
  alert: boolean;
  active: boolean;
  tone: "source" | "fixes" | "preview";
  meta: [string, string, string];
};

type VideoTaskCardProps = {
  active: boolean;
  disabled?: boolean;
  fileLabel: string;
  lines: VideoTaskLine[];
  thumbnailSrc?: string;
  toggles: {
    fixes: boolean;
    preview: boolean;
    telegram: boolean;
  };
  onToggleFixes: () => void;
  onTogglePreview: () => void;
  onToggleTelegram: () => void;
  onRun: () => void;
  onReveal: () => void;
  onOpen: () => void;
  onRemove: () => void;
};

function IconToggle({
  active,
  children,
  disabled,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone: "fixes" | "preview" | "telegram";
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "video-icon-toggle grid size-5 min-h-0 place-items-center rounded border border-transparent bg-transparent p-0",
        "text-[color-mix(in_oklch,var(--muted-foreground),transparent_15%)] outline-none transition-colors hover:bg-[color-mix(in_oklch,var(--accent),transparent_55%)]",
        "focus-visible:border-(--ring) focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--ring),transparent_55%)]",
        "disabled:pointer-events-none disabled:opacity-35",
        tone === "fixes" && "hover:text-[oklch(0.72_0.26_153)]",
        tone === "preview" && "hover:text-[oklch(0.74_0.19_229)]",
        tone === "telegram" && "hover:text-[oklch(0.76_0.18_252)]",
        active && tone === "fixes" && "text-[oklch(0.72_0.26_153)]",
        active && tone === "preview" && "text-[oklch(0.74_0.19_229)]",
        active && tone === "telegram" && "text-[oklch(0.76_0.18_252)]",
      )}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function VideoTaskCard({
  active,
  disabled,
  fileLabel,
  lines,
  thumbnailSrc,
  toggles,
  onToggleFixes,
  onTogglePreview,
  onToggleTelegram,
  onRun,
  onReveal,
  onOpen,
  onRemove,
}: VideoTaskCardProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);

  return (
    <ContextMenu onOpenChange={setContextMenuOpen}>
      <ContextMenuTrigger asChild>
        <section
          className={cn(
            "grid min-h-20 min-w-270 grid-cols-[auto_auto_1fr]",
            "items-stretch gap-2 overflow-hidden rounded-lg border border-[color-mix(in_oklch,var(--card-bright),transparent_40%)] bg-[color-mix(in_oklch,var(--card),transparent_20%)]",
            "p-0.5 pl-1.5 pr-3 shadow-md transition-colors hover:border-(--card-bright) hover:bg-card",
            contextMenuOpen && "border-ring ring ring-[color-mix(in_oklch,var(--ring),transparent_30%)] hover:border-ring",
            !active && "opacity-50",
          )}
        >
          <div className="grid items-center justify-items-center">
            <IconToggle active={toggles.fixes} disabled={disabled} label="Fixes" tone="fixes" onClick={onToggleFixes}>
              <BugOff className="size-3.5" />
            </IconToggle>
            <IconToggle active={toggles.preview} disabled={disabled} label="Preview" tone="preview" onClick={onTogglePreview}>
              <Eye className="size-3.5" />
            </IconToggle>
            <IconToggle active={toggles.telegram} disabled={disabled} label="TG" tone="telegram" onClick={onToggleTelegram}>
              <Send className="size-3.5" />
            </IconToggle>
          </div>

          <div className="grid h-full w-30 place-items-center self-center overflow-hidden rounded-md border border-[color-mix(in_oklch,var(--card-bright),transparent_20%)] bg-[color-mix(in_oklch,var(--card-bright),transparent_65%)]">
            {thumbnailSrc ? (
              <img alt="" className="h-full w-full object-cover" src={thumbnailSrc} />
            ) : (
              <span className="grid size-8 place-items-center rounded-full border border-white/10 bg-black/25 font-mono text-xs font-bold text-[color-mix(in_oklch,var(--foreground),transparent_20%)]">
                {fileLabel.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div className="grid min-w-0 content-center">
            {lines.map((line) => (
              <div
                className={cn(
                  "grid min-w-0 grid-cols-[70px_1fr_0.1fr_60px_40px] items-baseline gap-5",
                  !line.active && "opacity-30",
                )}
                key={line.label}
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs uppercase font-semibold",
                    "before:size-2 before:mr-1 before:rounded-full before:bg-current before:content-['']",
                    line.tone === "source" && "text-[color-mix(in_oklch,var(--muted-foreground),white_10%)]",
                    line.tone === "fixes" && "text-[oklch(0.72_0.26_153)]",
                    line.tone === "preview" && "text-[oklch(0.74_0.19_229)]",
                  )}
                >
                  {line.label}
                </span>
                <span
                  className={cn(
                    "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[color-mix(in_oklch,var(--foreground),transparent_10%)]",
                    line.tone === "fixes" && "text-[oklch(0.72_0.26_153)]",
                    line.tone === "preview" && "text-[oklch(0.74_0.19_229)]",
                    line.alert && "text-(--warning-fg)",
                  )}
                  title={line.text}
                >
                  {line.text}
                </span>
                {line.meta.map((value, index) => (
                  <span
                    className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right font-mono text-xs text-[color-mix(in_oklch,var(--muted-foreground),white_10%)]"
                    key={`${line.label}-${index}`}
                  >
                    {value}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem disabled={disabled} onSelect={onRun}>
          <Play className="size-4" />
          Запустить
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onReveal}>
          <FolderOpen className="size-4" />
          Показать в папке
        </ContextMenuItem>
        <ContextMenuItem onSelect={onOpen}>
          <ExternalLink className="size-4" />
          Открыть
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={disabled} variant="destructive" onSelect={onRemove}>
          <Trash2 className="size-4" />
          Убрать из списка
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
