import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Info, Pause, Play, Repeat } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type VideoPreviewPlayerProps = {
  className?: string;
  fps?: number | null;
  infoLabel?: string;
  infoPath?: string;
  src: string;
};

const playbackSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const loopModes = ["off", "loop", "pingpong"] as const;
const fallbackFps = 25;

type LoopMode = (typeof loopModes)[number];
type PlaybackSpeed = (typeof playbackSpeeds)[number];

function effectiveFps(fps?: number | null) {
  return fps && Number.isFinite(fps) && fps > 0 ? fps : fallbackFps;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatFrame(seconds: number, fps?: number | null) {
  return `${String(Math.max(0, Math.round(seconds * effectiveFps(fps)))).padStart(3, "0")}F`;
}

function snapTimeToFrame(time: number, fps?: number | null, duration?: number) {
  const snapped = Math.round(Math.max(0, time) * effectiveFps(fps)) / effectiveFps(fps);
  return typeof duration === "number" && Number.isFinite(duration)
    ? Math.max(0, Math.min(duration, snapped))
    : snapped;
}

function timelineOffset(ratio: number) {
  return `calc(0.5rem + (100% - 1rem) * ${Math.max(0, Math.min(1, ratio))})`;
}

export function VideoPreviewPlayer({
  className,
  fps,
  infoLabel,
  infoPath,
  src,
}: VideoPreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const syncFrameRef = useRef<number | null>(null);
  const pingPongFrameRef = useRef<number | null>(null);
  const pingPongLastTimestampRef = useRef<number | null>(null);
  const pingPongDirectionRef = useRef<1 | -1>(1);
  const currentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const loopModeRef = useRef<LoopMode>("loop");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInfoOverlay, setShowInfoOverlay] = useState(false);
  const [loopMode, setLoopMode] = useState<LoopMode>("loop");
  const [playbackRate, setPlaybackRate] = useState<PlaybackSpeed>(1);

  function setPlaybackTime(nextTime: number) {
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
  }

  function stopSync() {
    if (syncFrameRef.current !== null) {
      cancelAnimationFrame(syncFrameRef.current);
      syncFrameRef.current = null;
    }
  }

  function stopPingPong() {
    if (pingPongFrameRef.current !== null) {
      cancelAnimationFrame(pingPongFrameRef.current);
      pingPongFrameRef.current = null;
    }
    pingPongLastTimestampRef.current = null;
  }

  function startSync() {
    stopSync();

    const tick = () => {
      const video = videoRef.current;
      if (!video || !isPlayingRef.current || loopModeRef.current === "pingpong") {
        stopSync();
        return;
      }
      setPlaybackTime(video.currentTime);
      syncFrameRef.current = requestAnimationFrame(tick);
    };

    syncFrameRef.current = requestAnimationFrame(tick);
  }

  function pausePlayback() {
    const video = videoRef.current;
    isPlayingRef.current = false;
    setIsPlaying(false);
    video?.pause();
    stopSync();
    stopPingPong();
    if (video) {
      const snapped = snapTimeToFrame(video.currentTime, fps, duration);
      video.currentTime = snapped;
      setPlaybackTime(snapped);
    }
  }

  function startPingPong() {
    const video = videoRef.current;
    if (!video) return;

    stopPingPong();
    video.pause();

    if (duration > 0) {
      if (video.currentTime <= 0) pingPongDirectionRef.current = 1;
      else if (video.currentTime >= duration) pingPongDirectionRef.current = -1;
    }

    const tick = (timestamp: number) => {
      const activeVideo = videoRef.current;
      if (!activeVideo || !isPlayingRef.current || loopModeRef.current !== "pingpong") {
        stopPingPong();
        return;
      }

      const lastTimestamp = pingPongLastTimestampRef.current;
      pingPongLastTimestampRef.current = timestamp;
      if (lastTimestamp === null) {
        pingPongFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const actualDuration = Number.isFinite(activeVideo.duration) && activeVideo.duration > 0
        ? activeVideo.duration
        : duration;
      let nextTime =
        currentTimeRef.current +
        ((timestamp - lastTimestamp) / 1000) * playbackRate * pingPongDirectionRef.current;

      if (nextTime >= actualDuration) {
        nextTime = actualDuration;
        pingPongDirectionRef.current = -1;
      } else if (nextTime <= 0) {
        nextTime = 0;
        pingPongDirectionRef.current = 1;
      }

      activeVideo.currentTime = nextTime;
      setPlaybackTime(nextTime);
      pingPongFrameRef.current = requestAnimationFrame(tick);
    };

    pingPongFrameRef.current = requestAnimationFrame(tick);
  }

  async function startPlayback() {
    const video = videoRef.current;
    if (!video) return;

    isPlayingRef.current = true;
    setIsPlaying(true);

    if (loopModeRef.current === "pingpong") {
      startPingPong();
      return;
    }

    video.loop = loopModeRef.current === "loop";
    video.playbackRate = playbackRate;
    try {
      await video.play();
      startSync();
    } catch (error) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      console.error("Failed to start video playback:", error);
    }
  }

  async function togglePlayback() {
    if (isPlayingRef.current) {
      pausePlayback();
      return;
    }
    await startPlayback();
  }

  function seekToTime(time: number) {
    const video = videoRef.current;
    if (!video) return;

    const actualDuration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : duration;
    const nextTime = snapTimeToFrame(time, fps, actualDuration);
    video.currentTime = nextTime;
    setPlaybackTime(nextTime);
  }

  function stepFrame(direction: 1 | -1) {
    pausePlayback();
    const step = 1 / effectiveFps(fps);
    seekToTime(currentTimeRef.current + step * direction);
  }

  function cycleLoopMode() {
    const currentIndex = loopModes.indexOf(loopMode);
    const nextMode = loopModes[(currentIndex + 1) % loopModes.length];
    const wasPlaying = isPlayingRef.current;

    pausePlayback();
    loopModeRef.current = nextMode;
    setLoopMode(nextMode);

    if (wasPlaying) {
      queueMicrotask(() => {
        void startPlayback();
      });
    }
  }

  function cyclePlaybackRate() {
    setPlaybackRate((current) => {
      const currentIndex = playbackSpeeds.indexOf(current);
      return playbackSpeeds[(currentIndex + 1) % playbackSpeeds.length];
    });
  }

  function pointerRatio(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  }

  function seekFromPointer(event: PointerEvent<HTMLElement>) {
    const ratio = pointerRatio(event);
    seekToTime((duration || 0) * ratio);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    loopModeRef.current = loopMode;
    const video = videoRef.current;
    if (video) {
      video.loop = loopMode === "loop";
    }
  }, [loopMode]);

  useEffect(() => {
    return () => {
      stopSync();
      stopPingPong();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        stepFrame(-1);
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        stepFrame(1);
      } else if (event.code === "KeyL") {
        event.preventDefault();
        cycleLoopMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duration, fps, loopMode, playbackRate]);

  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const indicatorRatio = isDragging ? progress : hoverRatio;
  const indicatorTime = indicatorRatio === null ? null : indicatorRatio * duration;
  const playbackLabel = isPlaying ? "Пауза" : "Проиграть";
  const loopLabel = loopMode === "off" ? "Off" : loopMode === "loop" ? "Loop" : "Ping";

  return (
    <div className={cn("grid h-full w-full min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-3", className)}>
      <div className="grid min-h-0 min-w-0">
        <div className="group relative min-h-0 min-w-0 overflow-hidden rounded-md border border-white/10 bg-black/45 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
          <video
            key={src}
            ref={videoRef}
            className="block h-full w-full object-contain"
            playsInline
            preload="auto"
            src={src}
            onClick={() => {
              void togglePlayback();
            }}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              const nextDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
              setDuration(nextDuration);
              setPlaybackTime(0);
            }}
            onPause={() => {
              if (loopModeRef.current === "pingpong" && isPlayingRef.current) {
                return;
              }
              isPlayingRef.current = false;
              setIsPlaying(false);
              stopSync();
              stopPingPong();
            }}
            onPlay={() => {
              isPlayingRef.current = true;
              setIsPlaying(true);
              if (loopModeRef.current !== "pingpong") {
                startSync();
              }
            }}
            onEnded={() => {
              if (loopModeRef.current === "off") {
                pausePlayback();
              }
            }}
            onTimeUpdate={(event) => {
              if (!isPlayingRef.current || loopModeRef.current === "pingpong") {
                setPlaybackTime(event.currentTarget.currentTime);
              }
            }}
          />
          {showInfoOverlay && (infoLabel || infoPath) ? (
            <div className="pointer-events-none absolute left-3 top-3 max-w-[min(70vw,42rem)] rounded-md border border-white/10 bg-black/45 px-3 py-2 text-white shadow-lg backdrop-blur-md">
              {infoLabel ? (
                <div className="truncate text-sm font-semibold" title={infoLabel}>
                  {infoLabel}
                </div>
              ) : null}
              {infoPath ? (
                <div className="truncate font-mono text-[11px] text-white/65" title={infoPath}>
                  {infoPath}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/55 via-black/10 to-transparent" />
        </div>
      </div>

      <div className="w-full min-w-0 rounded-md border border-white/10 bg-popover/50 px-3 py-3 backdrop-blur-lg">
          <div
            className="relative flex h-5 cursor-pointer select-none items-center overflow-visible"
            style={{ touchAction: "none" }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setIsDragging(true);
              seekFromPointer(event);
            }}
            onPointerMove={(event) => {
              const ratio = pointerRatio(event);
              setHoverRatio(ratio);
              if (isDragging) {
                seekFromPointer(event);
              }
            }}
            onPointerUp={(event) => {
              setIsDragging(false);
              event.currentTarget.releasePointerCapture(event.pointerId);
              seekFromPointer(event);
            }}
            onPointerLeave={() => {
              if (!isDragging) {
                setHoverRatio(null);
              }
            }}
          >
            <div className="pointer-events-none absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/8" />
            <div
              className="pointer-events-none absolute left-1 top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-500/80"
              style={{ width: `calc((100% - 1rem) * ${progress})` }}
            />
            {indicatorRatio !== null && indicatorTime !== null ? (
              <div
                className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2 rounded bg-black/90 px-2 py-1 font-mono text-[10px] font-medium text-white shadow-lg"
                style={{ left: timelineOffset(indicatorRatio) }}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span>{formatDuration(indicatorTime)}</span>
                  <span className="text-amber-500">{formatFrame(indicatorTime, fps)}</span>
                </div>
              </div>
            ) : null}
            <div
              className="pointer-events-none absolute top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full border border-white/20 bg-sky-500 ring-3 ring-blue-400/30"
              style={{ left: `calc(${timelineOffset(progress)} - 0.375rem)` }}
            />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button
              aria-label={playbackLabel}
              className="size-7 rounded-full border border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10 hover:text-white focus-visible:ring-0"
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => {
                void togglePlayback();
              }}
            >
              {isPlaying ? <Pause className="size-3.5 fill-current" /> : <Play className="ml-0.5 size-3.5 fill-current" />}
            </Button>
            <Button
              aria-label="Назад на кадр"
              className="size-7 rounded-full border border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10 hover:text-white focus-visible:ring-0"
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => stepFrame(-1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              aria-label="Вперед на кадр"
              className="size-7 rounded-full border border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10 hover:text-white focus-visible:ring-0"
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => stepFrame(1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
            <Button
              aria-label="Loop mode"
              className="h-7 min-w-11 rounded-full border border-white/10 bg-white/5 px-2 font-semibold text-foreground/70 hover:bg-white/10 hover:text-white focus-visible:ring-0"
              size="sm"
              type="button"
              variant="ghost"
              onClick={cycleLoopMode}
            >
              {loopMode === "pingpong" ? <ArrowLeftRight className="size-3.5" /> : <Repeat className="size-3.5" />}
              <span className="ml-1 text-[11px]">{loopLabel}</span>
            </Button>
            <Button
              aria-label="Скорость"
              className="h-7 min-w-11 rounded-full border border-white/10 bg-white/5 px-2 font-semibold text-foreground/70 hover:bg-white/10 hover:text-white focus-visible:ring-0"
              size="sm"
              type="button"
              variant="ghost"
              onClick={cyclePlaybackRate}
            >
              {playbackRate}x
            </Button>
            <Button
              aria-label={showInfoOverlay ? "Скрыть информацию" : "Показать информацию"}
              aria-pressed={showInfoOverlay}
              className={cn(
                "h-7 min-w-9 rounded-full border border-white/10 bg-white/5 px-2 font-semibold text-foreground/70 hover:bg-white/10 hover:text-white focus-visible:ring-0",
                showInfoOverlay && "bg-white/12 text-white",
              )}
              size="sm"
              title={showInfoOverlay ? "Скрыть информацию" : "Показать информацию"}
              type="button"
              variant="ghost"
              onClick={() => setShowInfoOverlay((current) => !current)}
            >
              <Info className="size-3.5" />
            </Button>

            <div className="ml-auto flex items-center gap-1.5 font-mono text-xs text-foreground/85">
              <span>{formatDuration(currentTime)}</span>
              <span className="text-amber-500">{formatFrame(currentTime, fps)}</span>
              <span>/</span>
              <span>{formatDuration(duration)}</span>
              <span className="text-amber-500">{formatFrame(duration, fps)}</span>
            </div>
          </div>
      </div>
    </div>
  );
}
