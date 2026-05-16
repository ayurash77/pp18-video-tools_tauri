import type React from "react";
import { BugOff, ExternalLink, Eye, FolderOpen, Send, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

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
  children: React.ReactNode;
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
        "focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--ring),transparent_55%)]",
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
  onReveal,
  onOpen,
  onRemove,
}: VideoTaskCardProps) {
  return (
    <section
      className={cn(
        "grid min-h-[128px] min-w-[1080px] grid-cols-[20px_212px_minmax(560px,1fr)_94px]",
        "items-stretch gap-2.5 overflow-hidden rounded-lg border border-[color-mix(in_oklch,var(--card-bright),transparent_40%)] bg-[color-mix(in_oklch,var(--card),transparent_20%)]",
        "p-1 pr-2 shadow-md transition-colors hover:border-[var(--card-bright)] hover:bg-[var(--card)]",
        !active && "opacity-55",
      )}
    >
      <div className="grid items-center justify-items-center gap-2 py-6">
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

      <div className="grid h-[120px] w-[212px] place-items-center self-center overflow-hidden rounded-md border border-[color-mix(in_oklch,var(--card-bright),transparent_20%)] bg-[color-mix(in_oklch,var(--card-bright),transparent_65%)]">
        {thumbnailSrc ? (
          <img alt="" className="h-full w-full object-cover" src={thumbnailSrc} />
        ) : (
          <span className="grid size-8 place-items-center rounded-full border border-white/10 bg-black/25 font-mono text-xs font-bold text-[color-mix(in_oklch,var(--foreground),transparent_20%)]">
            {fileLabel.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <div className="grid min-w-0 content-center gap-0.5">
        {lines.map((line) => (
          <div
            className={cn(
              "grid min-w-0 grid-cols-[46px_minmax(260px,1fr)_92px_62px_54px] items-baseline gap-2",
              !line.active && "opacity-30",
            )}
            key={line.label}
          >
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-bold leading-[18px]",
                "before:size-1.5 before:rounded-full before:bg-current before:content-['']",
                line.tone === "source" && "text-[color-mix(in_oklch,var(--muted-foreground),white_10%)]",
                line.tone === "fixes" && "text-[oklch(0.72_0.26_153)]",
                line.tone === "preview" && "text-[oklch(0.74_0.19_229)]",
              )}
            >
              {line.label}
            </span>
            <span
              className={cn(
                "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] font-semibold leading-[18px] text-[color-mix(in_oklch,var(--foreground),transparent_10%)]",
                line.tone === "fixes" && "text-[oklch(0.72_0.26_153)]",
                line.tone === "preview" && "text-[oklch(0.74_0.19_229)]",
                line.alert && "text-[var(--warning-fg)]",
              )}
              title={line.text}
            >
              {line.text}
            </span>
            {line.meta.map((value, index) => (
              <span
                className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right font-mono text-[11px] leading-[18px] text-[color-mix(in_oklch,var(--muted-foreground),white_10%)]"
                key={`${line.label}-${index}`}
              >
                {value}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1">
        <Button aria-label="Показать в папке" size="icon" title="Показать в папке" type="button" variant="ghost" onClick={onReveal}>
          <FolderOpen />
        </Button>
        <Button aria-label="Открыть" size="icon" title="Открыть" type="button" variant="ghost" onClick={onOpen}>
          <ExternalLink />
        </Button>
        <Button aria-label="Убрать из списка" disabled={disabled} size="icon" title="Убрать из списка" type="button" variant="ghost" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
    </section>
  );
}
