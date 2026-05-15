import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { open } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ExternalLink, FolderOpen, FolderPlus, List, Play, Settings, Square, X } from "lucide-react";
import { Button } from "./components/ui/button";
import { Checkbox } from "./components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Panel } from "./components/ui/panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import "./styles.css";

type VideoMetadata = {
  resolution: string;
  frames: number | null;
};

type DuplicateMode = "soft" | "medium" | "aggressive" | "veryAggressive" | "maximum";
type ExistingMode = "skip" | "overwrite";

type ProcessingOptions = {
  latestVersionsOnly: boolean;
  removeDupes: boolean;
  duplicateMode: DuplicateMode;
  convertTo25Fps: boolean;
  existingMode: ExistingMode;
};

type VideoRow = {
  id: string;
  path: string;
  fixes: boolean;
  preview: boolean;
  telegram: boolean;
  metadata?: VideoMetadata;
  metadataStatus: "idle" | "loading" | "ready" | "error";
  workflowStatus?: string;
};

type PathExistence = {
  path: string;
  exists: boolean;
};

type WorkflowEvent = {
  rowId: string | null;
  phase: "workflow" | "fixes" | "preview" | "telegram";
  status: "started" | "running" | "done" | "skipped" | "error" | "cancelled" | "finished";
  message: string;
  completed: number;
  total: number;
  output: string | null;
};

type TelegramSettingsState = {
  botToken: string;
  chatId: string;
  hasBotToken: boolean;
  hasChatId: boolean;
};

type UpdateState =
  | { status: "idle"; update: null; error: null; progress: string }
  | { status: "checking"; update: null; error: null; progress: string }
  | { status: "available"; update: Update; error: null; progress: string }
  | { status: "installing"; update: Update; error: null; progress: string }
  | { status: "ready"; update: Update; error: null; progress: string }
  | { status: "error"; update: Update | null; error: string; progress: string };

const videoExtensions = new Set([
  "3g2",
  "3gp",
  "avi",
  "dv",
  "flv",
  "m2ts",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "mts",
  "mxf",
  "ogv",
  "ts",
  "vob",
  "webm",
  "wmv",
]);

const duplicateModeLabels: Record<DuplicateMode, string> = {
  soft: "Очень мягко",
  medium: "Мягко",
  aggressive: "Умеренно",
  veryAggressive: "Агрессивно",
  maximum: "Максимально (есть риск)",
};

const defaultOptions: ProcessingOptions = {
  latestVersionsOnly: false,
  removeDupes: true,
  duplicateMode: "aggressive",
  convertTo25Fps: true,
  existingMode: "skip",
};

const idleUpdateState: UpdateState = {
  status: "idle",
  update: null,
  error: null,
  progress: "",
};

const logStorageKey = "pp18VideoToolsLog";
const logSessionKey = "pp18VideoToolsLogSession";
const processingOptionsStorageKey = "processingOptions";

type AppErrorBoundaryState = {
  error: Error | null;
};

function isVideoPath(path: string): boolean {
  const name = fileName(path);
  if (baseName(name).toLowerCase().endsWith("__preview")) {
    return false;
  }
  const extension = path.split(".").pop()?.toLowerCase();
  return Boolean(extension && videoExtensions.has(extension));
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function baseName(path: string): string {
  return fileName(path).replace(/\.[^.]+$/, "");
}

function makeFixedPath(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[\\/]/);
  const name = parts.pop() ?? path;
  return [...parts, "fixed", `${baseName(name)}.mov`].join(separator);
}

function makePreviewPath(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[\\/]/);
  const name = parts.pop() ?? path;
  return [...parts, `${baseName(name)}__preview.mp4`].join(separator);
}

function uniqueSorted(paths: string[]): string[] {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b, "ru"));
}

type VersionedPath = {
  groupKey: string;
  path: string;
  version: number | null;
};

function filterLatestVersions(paths: string[]): string[] {
  const latest = new Map<string, VersionedPath>();
  const unversioned: string[] = [];

  for (const path of paths) {
    const versioned = parseVersionedPath(path);
    if (!versioned) {
      unversioned.push(path);
      continue;
    }

    const current = latest.get(versioned.groupKey);
    if (!current || (versioned.version ?? 0) > (current.version ?? 0)) {
      latest.set(versioned.groupKey, versioned);
    }
  }

  return uniqueSorted([...unversioned, ...Array.from(latest.values()).map((item) => item.path)]);
}

function parseVersionedPath(path: string): VersionedPath | null {
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(/[\\/]/);
  const name = parts.pop() ?? path;
  const extensionMatch = name.match(/(\.[^.]+)$/);
  const extension = extensionMatch?.[1].toLowerCase() ?? "";
  const stem = extension ? name.slice(0, -extension.length) : name;
  const versionMatch = stem.match(/^(.*)_v(\d{2,})$/i);
  if (!versionMatch) {
    return null;
  }

  const folder = parts.join(separator);
  const baseStem = versionMatch[1].toLowerCase();
  const version = Number.parseInt(versionMatch[2], 10);
  if (!Number.isFinite(version)) {
    return null;
  }

  return {
    groupKey: `${folder.toLowerCase()}${separator}${baseStem}${extension}`,
    path,
    version,
  };
}

function readStoredLog(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(logStorageKey) ?? "[]");
    return Array.isArray(value) ? value.filter((line) => typeof line === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredLog(lines: string[]) {
  try {
    localStorage.setItem(logStorageKey, JSON.stringify(lines.slice(0, 400)));
  } catch {
    // Keep the UI alive even when WebView storage is unavailable or full.
  }
}

function prepareSessionLog(isLogWindow: boolean) {
  if (isLogWindow) {
    return;
  }

  try {
    if (sessionStorage.getItem(logSessionKey)) {
      return;
    }
    localStorage.removeItem(logStorageKey);
    sessionStorage.setItem(logSessionKey, String(Date.now()));
  } catch {
    try {
      localStorage.removeItem(logStorageKey);
    } catch {
      // Logging is best-effort; startup must continue even if storage is unavailable.
    }
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function isDuplicateMode(value: unknown): value is DuplicateMode {
  return (
    value === "soft" ||
    value === "medium" ||
    value === "aggressive" ||
    value === "veryAggressive" ||
    value === "maximum"
  );
}

function isExistingMode(value: unknown): value is ExistingMode {
  return value === "skip" || value === "overwrite";
}

function loadProcessingOptions(): ProcessingOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(processingOptionsStorageKey) ?? "{}") as Partial<ProcessingOptions>;
    return {
      latestVersionsOnly:
        typeof raw.latestVersionsOnly === "boolean"
          ? raw.latestVersionsOnly
          : defaultOptions.latestVersionsOnly,
      removeDupes: typeof raw.removeDupes === "boolean" ? raw.removeDupes : defaultOptions.removeDupes,
      duplicateMode: isDuplicateMode(raw.duplicateMode) ? raw.duplicateMode : defaultOptions.duplicateMode,
      convertTo25Fps:
        typeof raw.convertTo25Fps === "boolean" ? raw.convertTo25Fps : defaultOptions.convertTo25Fps,
      existingMode: isExistingMode(raw.existingMode) ? raw.existingMode : defaultOptions.existingMode,
    };
  } catch {
    return defaultOptions;
  }
}

function saveProcessingOptions(options: ProcessingOptions) {
  try {
    localStorage.setItem(processingOptionsStorageKey, JSON.stringify(options));
  } catch {
    // Persisting options is best-effort; a storage error must not blank the app.
  }
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    writeStoredLog([
      ...readStoredLog(),
      `[${new Date().toLocaleTimeString("ru-RU", { hour12: false })}] UI error: ${error.message}`,
    ]);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="appError">
        <h1>Ошибка интерфейса</h1>
        <p>{this.state.error.message}</p>
        <div>
          <button type="button" onClick={() => window.location.reload()}>
            Перезагрузить
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(processingOptionsStorageKey);
              window.location.reload();
            }}
          >
            Сбросить настройки
          </button>
        </div>
      </main>
    );
  }
}

function statusFromEvent(event: WorkflowEvent): string | undefined {
  if (event.phase === "fixes") {
    if (event.status === "cancelled") return "Отменено";
    if (event.status === "running") return "Обработка";
    if (event.status === "done") return "Готово";
    if (event.status === "skipped") return "Пропущен";
    if (event.status === "error") return "Ошибка";
  }
  if (event.phase === "preview") {
    if (event.status === "cancelled") return "Отменено";
    if (event.status === "running") return "Превью";
    if (event.status === "done") return "Превью готово";
    if (event.status === "error") return "Ошибка превью";
  }
  if (event.phase === "telegram") {
    if (event.status === "cancelled") return "TG отменен";
    if (event.status === "running") return "Отправка TG";
    if (event.status === "done") return "TG отправлено";
    if (event.status === "error") return "Ошибка TG";
    if (event.status === "skipped") return "TG пропущен";
  }
  return undefined;
}

function App() {
  const [rows, setRows] = useState<VideoRow[]>([]);
  const [sourcePaths, setSourcePaths] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>(() => readStoredLog());
  const [pathExists, setPathExists] = useState<Record<string, boolean>>({});
  const [options, setOptions] = useState<ProcessingOptions>(() => loadProcessingOptions());
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [statusText, setStatusText] = useState("Готов к работе");
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettingsState | null>(null);
  const [telegramDraft, setTelegramDraft] = useState({ botToken: "", chatId: "" });
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>(idleUpdateState);
  const compactLogRef = useRef<HTMLDivElement | null>(null);
  const metadataBatchRef = useRef(0);

  const existenceKey = useMemo(
    () => rows.map((row) => `${row.path}|${row.fixes}|${row.preview}|${row.telegram}`).join("\n"),
    [rows],
  );

  useEffect(() => {
    void loadTelegramSettings();
    if (import.meta.env.PROD) {
      void checkForAppUpdate();
    }
  }, []);

  useEffect(() => {
    saveProcessingOptions(options);
  }, [options]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen<WorkflowEvent>("workflow-event", (event) => {
      const payload = event.payload;
      if (payload.message) {
        appendLog(payload.message);
      }
      setProgress({
        completed: payload.status === "finished" ? payload.total : payload.completed,
        total: payload.total,
      });
      if (payload.phase === "workflow") {
        setStatusText(payload.message);
      } else if (payload.rowId) {
        const nextStatus = statusFromEvent(payload);
        if (nextStatus) {
          setRows((current) =>
            current.map((row) =>
              row.id === payload.rowId ? { ...row, workflowStatus: nextStatus } : row,
            ),
          );
        }
      }
      if (payload.status === "finished") {
        setRunning(false);
        setCancelling(false);
        void refreshPathExistence();
      }
    }).then((dispose) => {
      if (cancelled) {
        dispose();
      } else {
        unlisten = dispose;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    void refreshPathExistence();
  }, [existenceKey]);

  useEffect(() => {
    if (compactLogRef.current) {
      compactLogRef.current.scrollTop = compactLogRef.current.scrollHeight;
    }
  }, [log]);

  async function loadTelegramSettings() {
    try {
      const settings = await invoke<TelegramSettingsState>("telegram_settings");
      setTelegramSettings(settings);
      setTelegramDraft({ botToken: settings.botToken, chatId: settings.chatId });
    } catch (error) {
      appendLog(`Не удалось загрузить настройки Telegram: ${String(error)}`);
    }
  }

  async function checkForAppUpdate() {
    try {
      setUpdateState({ status: "checking", update: null, error: null, progress: "" });
      appendLog("Проверка обновлений...");
      const update = await check();
      if (!update) {
        setUpdateState(idleUpdateState);
        appendLog("Обновлений нет.");
        return;
      }

      setUpdateState({ status: "available", update, error: null, progress: "" });
      setStatusText(`Доступно обновление ${update.version}`);
      setUpdateDialogOpen(true);
      appendLog(`Найдено обновление ${update.version}. Ожидает подтверждения.`);
    } catch (error) {
      setUpdateState({ status: "error", update: null, error: String(error), progress: "" });
      appendLog(`Не удалось проверить обновление: ${String(error)}`);
    }
  }

  async function installAppUpdate() {
    const update = updateState.update;
    if (!update || updateState.status === "installing") {
      return;
    }

    try {
      setUpdateState({ status: "installing", update, error: null, progress: "Подготовка..." });
      setStatusText(`Установка обновления ${update.version}`);
      appendLog(`Установка обновления ${update.version}...`);
      let downloaded = 0;
      let total: number | null = null;

      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          total = typeof event.data.contentLength === "number" ? event.data.contentLength : null;
        }
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
        }
        const progress = updateProgressText(event, downloaded, total);
        setUpdateState({ status: "installing", update, error: null, progress });
      });

      setUpdateState({ status: "ready", update, error: null, progress: "Установлено" });
      setStatusText("Обновление установлено. Нужен перезапуск");
      appendLog("Обновление установлено. Требуется перезапуск.");
    } catch (error) {
      const message = String(error);
      setUpdateState({ status: "error", update, error: message, progress: "" });
      setStatusText("Ошибка обновления");
      appendLog(`Не удалось установить обновление: ${message}`);
    }
  }

  function updateProgressText(event: DownloadEvent, downloaded: number, total: number | null): string {
    if (event.event === "Started") {
      return total ? `Загрузка: 0/${formatBytes(total)}` : "Загрузка...";
    }
    if (event.event === "Progress") {
      return total ? `Загрузка: ${formatBytes(downloaded)}/${formatBytes(total)}` : `Загружено: ${formatBytes(downloaded)}`;
    }
    return "Установка...";
  }

  function closeUpdateDialog(open: boolean) {
    if (!open && updateState.status === "installing") {
      return;
    }
    setUpdateDialogOpen(open);
  }

  async function restartApp() {
    appendLog("Перезапуск приложения...");
    await relaunch();
  }

  async function saveTelegramSettings() {
    try {
      const settings = await invoke<TelegramSettingsState>("save_telegram_settings", {
        settings: telegramDraft,
      });
      setTelegramSettings(settings);
      setTelegramDraft({ botToken: settings.botToken, chatId: settings.chatId });
      setTelegramOpen(false);
      appendLog("Настройки Telegram обновлены.");
    } catch (error) {
      appendLog(`Не удалось сохранить настройки Telegram: ${String(error)}`);
    }
  }

  function appendLog(message: string) {
    const time = new Date().toLocaleTimeString("ru-RU", { hour12: false });
    const next = [...readStoredLog(), `[${time}] ${message}`].slice(-400);
    writeStoredLog(next);
    setLog(next);
  }

  async function openLogWindow() {
    try {
      const existing = await WebviewWindow.getByLabel("logs");
      if (existing) {
        await existing.setFocus();
        return;
      }

      new WebviewWindow("logs", {
        title: "PP18 Video Tools Log",
        url: "index.html#logs",
        width: 760,
        height: 420,
        minWidth: 520,
        minHeight: 260,
      });
    } catch (error) {
      appendLog(`Не удалось открыть окно логов: ${String(error)}`);
    }
  }

  async function refreshPathExistence() {
    const paths = uniqueSorted(
      rows.flatMap((row) => {
        const fixedPath = makeFixedPath(row.path);
        return [fixedPath, makePreviewPath(row.path), makePreviewPath(fixedPath)];
      }),
    );
    if (paths.length === 0) {
      setPathExists({});
      return;
    }

    try {
      const results = await invoke<PathExistence[]>("path_existence", { paths });
      setPathExists(Object.fromEntries(results.map((result) => [result.path, result.exists])));
    } catch (error) {
      appendLog(`Не удалось проверить output-файлы: ${String(error)}`);
    }
  }

  async function chooseFiles() {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "Выберите видеофайлы",
      filters: [{ name: "Видео", extensions: Array.from(videoExtensions) }],
    });

    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (paths.length > 0) {
      setStatusText(`Добавление файлов: ${paths.length}`);
    }
    applyVideoPaths(paths, "Выбрано видеофайлов");
  }

  async function chooseFolder() {
    const selected = await open({
      multiple: true,
      directory: true,
      title: "Выберите папки с видео",
    });

    const folders = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (folders.length === 0) {
      return;
    }

    setStatusText(folders.length === 1 ? "Чтение папки..." : `Чтение папок: ${folders.length}`);
    const results = await Promise.all(
      folders.map(async (folder) => {
        try {
          const paths = await invoke<string[]>("folder_files", { path: folder });
          return { folder, paths, error: null as string | null };
        } catch (error) {
          return { folder, paths: [], error: String(error) };
        }
      }),
    );

    const paths = results.flatMap((result) => result.paths);
    applyVideoPaths(
      paths,
      folders.length === 1 ? "В папке найдено видеофайлов" : "В папках найдено видеофайлов",
    );

    const failed = results.filter((result) => result.error);
    if (failed.length > 0) {
      appendLog(`Не удалось прочитать папки: ${failed.length}/${folders.length}`);
      for (const result of failed.slice(0, 3)) {
        appendLog(`${fileName(result.folder)}: ${result.error}`);
      }
    }
  }

  function buildRows(paths: string[], latestVersionsOnly: boolean): VideoRow[] {
    const allVideos = uniqueSorted(paths.filter(isVideoPath));
    const videos = latestVersionsOnly ? filterLatestVersions(allVideos) : allVideos;
    const existingRows = new Map(rows.map((row) => [row.path, row]));
    return videos.map((path) => ({
      ...existingRows.get(path),
      id: path,
      path,
      fixes: existingRows.get(path)?.fixes ?? false,
      preview: existingRows.get(path)?.preview ?? true,
      telegram: existingRows.get(path)?.telegram ?? true,
      metadataStatus: existingRows.get(path)?.metadataStatus ?? "idle",
      workflowStatus: undefined,
    }));
  }

  function applyVideoPaths(paths: string[], logPrefix: string) {
    const allVideos = uniqueSorted(paths.filter(isVideoPath));
    const videos = options.latestVersionsOnly ? filterLatestVersions(allVideos) : allVideos;
    setSourcePaths(allVideos);
    const nextRows: VideoRow[] = videos.map((path) => ({
      id: path,
      path,
      fixes: false,
      preview: true,
      telegram: true,
      metadataStatus: "loading",
    }));

    setRows(nextRows);
    setStatusText(nextRows.length ? `Всего файлов: ${nextRows.length}` : "Файлы не выбраны");
    appendLog(
      options.latestVersionsOnly && allVideos.length !== videos.length
        ? `${logPrefix}: ${nextRows.length}; скрыто старых версий: ${allVideos.length - videos.length}`
        : `${logPrefix}: ${nextRows.length}`,
    );
    queueMetadataLoading(nextRows.map((row) => row.path));
  }

  function setLatestVersionsOnly(latestVersionsOnly: boolean) {
    setOptions((current) => ({ ...current, latestVersionsOnly }));
    if (sourcePaths.length === 0) {
      return;
    }

    const nextRows = buildRows(sourcePaths, latestVersionsOnly);
    const rowsWithLoading = nextRows.map((row) =>
      row.metadataStatus === "idle" ? { ...row, metadataStatus: "loading" as const } : row,
    );
    setRows(rowsWithLoading);
    setStatusText(rowsWithLoading.length ? `Всего файлов: ${rowsWithLoading.length}` : "Файлы не выбраны");

    const hidden = sourcePaths.length - nextRows.length;
    appendLog(
      latestVersionsOnly
        ? `Фильтр последних версий включен: ${rowsWithLoading.length}; скрыто старых версий: ${hidden}`
        : `Фильтр последних версий выключен: ${rowsWithLoading.length}`,
    );

    queueMetadataLoading(
      rowsWithLoading
        .filter((row) => row.metadataStatus === "loading" && !row.metadata)
        .map((row) => row.path),
    );
  }

  function queueMetadataLoading(paths: string[]) {
    const pending = uniqueSorted(paths);
    const batch = metadataBatchRef.current + 1;
    metadataBatchRef.current = batch;
    if (pending.length === 0) {
      return;
    }

    window.setTimeout(() => {
      void loadMetadataQueue(pending, batch);
    }, 0);
  }

  async function loadMetadataQueue(paths: string[], batch: number) {
    const concurrency = Math.min(3, paths.length);
    let index = 0;

    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (metadataBatchRef.current === batch && index < paths.length) {
          const path = paths[index];
          index += 1;
          await loadMetadata(path, batch);
        }
      }),
    );
  }

  async function loadMetadata(path: string, batch: number) {
    try {
      const metadata = await invoke<VideoMetadata>("probe_video", { path });
      if (metadataBatchRef.current !== batch) {
        return;
      }
      setRows((current) =>
        current.map((row) =>
          row.path === path ? { ...row, metadata, metadataStatus: "ready" } : row,
        ),
      );
    } catch (error) {
      if (metadataBatchRef.current !== batch) {
        return;
      }
      setRows((current) =>
        current.map((row) => (row.path === path ? { ...row, metadataStatus: "error" } : row)),
      );
      appendLog(`ffprobe: ${fileName(path)}: ${String(error)}`);
    }
  }

  function updateRow(path: string, patch: Partial<VideoRow>) {
    setRows((current) =>
      current.map((row) =>
        row.path === path ? { ...row, workflowStatus: undefined, ...patch } : row,
      ),
    );
  }

  function removeRow(path: string) {
    setRows((current) => current.filter((row) => row.path !== path));
  }

  function toggleColumn(column: "fixes" | "preview" | "telegram") {
    const hasUnchecked = rows.some((row) => !row[column]);
    setRows((current) =>
      current.map((row) => ({ ...row, workflowStatus: undefined, [column]: hasUnchecked })),
    );
  }

  async function runSelectedActions() {
    if (running) {
      return;
    }
    if (rows.length === 0) {
      appendLog("Запуск отменен: файлы не выбраны.");
      setStatusText("Файлы не выбраны");
      return;
    }
    if (!rows.some((row) => row.fixes || row.preview || row.telegram)) {
      appendLog("Запуск отменен: действия в списке не выбраны.");
      setStatusText("Нет выбранных действий");
      return;
    }

    setRunning(true);
    setCancelling(false);
    setProgress({ completed: 0, total: 0 });
    setStatusText("Запуск...");
    setRows((current) => current.map((row) => ({ ...row, workflowStatus: undefined })));
    appendLog(processingSummary());

    try {
      await invoke("run_actions", {
        request: {
          rows: rows.map(({ id, path, fixes, preview, telegram }) => ({
            id,
            path,
            fixes,
            preview,
            telegram,
          })),
          options,
        },
      });
    } catch (error) {
      appendLog(`Ошибка запуска: ${String(error)}`);
      setStatusText("Ошибка запуска");
      setRunning(false);
      setCancelling(false);
    } finally {
      await refreshPathExistence();
    }
  }

  async function cancelCurrentRun() {
    if (!running || cancelling) {
      return;
    }

    setCancelling(true);
    setStatusText("Остановка...");
    appendLog("Запрошена остановка текущей операции.");
    try {
      await invoke("cancel_actions");
    } catch (error) {
      appendLog(`Не удалось остановить операцию: ${String(error)}`);
      setCancelling(false);
    }
  }

  function processingSummary(): string {
    const duplicateMode = options.removeDupes ? duplicateModeLabels[options.duplicateMode] : "нет";
    const fpsMode = options.convertTo25Fps
      ? "25 fps"
      : options.removeDupes
        ? "сжатие тайминга после удаления дублей"
        : "без видео-фильтра";
    const existingMode =
      options.existingMode === "overwrite" ? "перезаписывать" : "пропускать";
    return `Настройки: выбрано файлов: ${rows.length}; дубли: ${duplicateMode}; тайминг: ${fpsMode}; существующие: ${existingMode}.`;
  }

  async function reveal(path: string) {
    try {
      await invoke("reveal_in_folder", { path });
    } catch (error) {
      appendLog(`Не удалось показать файл: ${String(error)}`);
    }
  }

  async function openInSystem(path: string) {
    try {
      await invoke("open_in_system_player", { path });
    } catch (error) {
      appendLog(`Не удалось открыть файл: ${String(error)}`);
    }
  }

  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <main className="app bg-main text-main-text">
      <Panel className="workflowBar">
        <div className="workflowControls">
          <Button
            className={telegramSettings?.hasBotToken && telegramSettings.hasChatId ? "telegramReady" : ""}
            disabled={running}
            type="button"
            variant="outline"
            onClick={() => setTelegramOpen(true)}
          >
            <Settings />
            Telegram
          </Button>
          <label>
            <Checkbox
              checked={options.latestVersionsOnly}
              disabled={running}
              onCheckedChange={(checked) => setLatestVersionsOnly(checked === true)}
            />
            Последние версии
          </label>
          <label>
            <Checkbox
              checked={options.removeDupes}
              disabled={running}
              onCheckedChange={(checked) => {
                setOptions((current) => ({ ...current, removeDupes: checked === true }));
              }}
            />
            Удалять дублирующиеся кадры
          </label>
          <Select
            disabled={running || !options.removeDupes}
            onValueChange={(value) => {
              const duplicateMode = value as DuplicateMode;
              setOptions((current) => ({
                ...current,
                duplicateMode,
              }));
            }}
            value={options.duplicateMode}
          >
            <SelectTrigger className="workflowSelect" aria-label="Режим удаления дублей">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(duplicateModeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label>
            <Checkbox
              checked={options.convertTo25Fps}
              disabled={running}
              onCheckedChange={(checked) => {
                setOptions((current) => ({ ...current, convertTo25Fps: checked === true }));
              }}
            />
            25 fps без добавления кадров
          </label>
          <Select
            disabled={running}
            onValueChange={(value) => {
              const existingMode = value as ExistingMode;
              setOptions((current) => ({
                ...current,
                existingMode,
              }));
            }}
            value={options.existingMode}
          >
            <SelectTrigger className="workflowSelect" aria-label="Режим существующих файлов">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skip">Пропускать существующие</SelectItem>
              <SelectItem value="overwrite">Перезаписывать существующие</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="workflowActions">
          <Button
            aria-label="Выбрать файлы"
            disabled={running}
            size="icon"
            title="Выбрать файлы"
            type="button"
            variant="outline"
            onClick={chooseFiles}
          >
            <FolderOpen />
          </Button>
          <Button
            aria-label="Выбрать папку"
            disabled={running}
            size="icon"
            title="Выбрать папку"
            type="button"
            variant="outline"
            onClick={chooseFolder}
          >
            <FolderPlus />
          </Button>
          {running ? (
            <Button disabled={cancelling} type="button" variant="destructive" onClick={cancelCurrentRun}>
              <Square />
              {cancelling ? "Остановка" : "Остановить"}
            </Button>
          ) : (
            <Button disabled={rows.length === 0} type="button" onClick={runSelectedActions}>
              <Play />
              Запустить
            </Button>
          )}
        </div>
      </Panel>

      <Dialog open={telegramOpen} onOpenChange={setTelegramOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Настройки Telegram</DialogTitle>
            <DialogDescription>
              Токен бота и chat id сохраняются локально в настройках приложения.
            </DialogDescription>
          </DialogHeader>
          <div className="dialogForm">
            <label>
              <span>Bot token</span>
              <Input
                autoComplete="off"
                onChange={(event) => {
                  const botToken = event.currentTarget.value;
                  setTelegramDraft((current) => ({ ...current, botToken }));
                }}
                placeholder="123456:ABC..."
                type="password"
                value={telegramDraft.botToken}
              />
            </label>
            <label>
              <span>Chat ID</span>
              <Input
                autoComplete="off"
                onChange={(event) => {
                  const chatId = event.currentTarget.value;
                  setTelegramDraft((current) => ({ ...current, chatId }));
                }}
                placeholder="-100..."
                value={telegramDraft.chatId}
              />
            </label>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Отмена
              </Button>
            </DialogClose>
            <Button type="button" onClick={saveTelegramSettings}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={updateDialogOpen} onOpenChange={closeUpdateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {updateState.status === "ready"
                ? "Обновление установлено"
                : updateState.status === "error"
                  ? "Ошибка обновления"
                  : "Доступно обновление"}
            </DialogTitle>
            <DialogDescription>
              {updateState.update
                ? updateState.status === "ready"
                  ? `Версия ${updateState.update.version} установлена. Перезапустите приложение, чтобы перейти на нее.`
                  : `Найдена версия ${updateState.update.version}. Установить сейчас?`
                : updateState.error ?? "Не удалось проверить обновление."}
            </DialogDescription>
          </DialogHeader>
          {updateState.update?.body ? <div className="updateNotes">{updateState.update.body}</div> : null}
          {updateState.progress ? <div className="updateProgress">{updateState.progress}</div> : null}
          {updateState.error ? <div className="updateError">{updateState.error}</div> : null}
          <DialogFooter>
            {updateState.status === "ready" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setUpdateDialogOpen(false)}>
                  Позже
                </Button>
                <Button type="button" onClick={restartApp}>
                  Перезапустить
                </Button>
              </>
            ) : updateState.status === "installing" ? (
              <Button disabled type="button">
                Установка...
              </Button>
            ) : updateState.status === "error" ? (
              <Button type="button" variant="outline" onClick={() => setUpdateDialogOpen(false)}>
                Закрыть
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setUpdateDialogOpen(false)}>
                  Позже
                </Button>
                <Button disabled={!updateState.update} type="button" onClick={installAppUpdate}>
                  Установить
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Panel className="tableWrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button disabled={running || rows.length === 0} onClick={() => toggleColumn("fixes")} size="sm" type="button" variant="ghost">
                  Fixes
                </Button>
              </TableHead>
              <TableHead>
                <Button disabled={running || rows.length === 0} onClick={() => toggleColumn("preview")} size="sm" type="button" variant="ghost">
                  Preview
                </Button>
              </TableHead>
              <TableHead>
                <Button disabled={running || rows.length === 0} onClick={() => toggleColumn("telegram")} size="sm" type="button" variant="ghost">
                  TG
                </Button>
              </TableHead>
              <TableHead>Инфо</TableHead>
              <TableHead>Файл</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell className="empty" colSpan={7}>
                  Файлы не выбраны
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const fixedPath = makeFixedPath(row.path);
                const previewInput = row.fixes ? fixedPath : row.path;
                const previewPath = makePreviewPath(previewInput);
                const showsPreviewPath = row.preview || row.telegram;
                const outputPath = row.fixes ? fixedPath : showsPreviewPath ? previewPath : "";
                const displayPreviewPath = row.fixes && showsPreviewPath ? previewPath : "";
                const fixedOutputExists = row.fixes && Boolean(pathExists[fixedPath]);
                const previewOutputExists = row.preview && Boolean(pathExists[previewPath]);
                const outputExists =
                  (row.fixes && fixedOutputExists) || (!row.fixes && row.preview && previewOutputExists);
                const displayPreviewExists = row.fixes && row.preview && previewOutputExists;
                const missingPreviewForSend =
                  row.telegram && !row.preview && showsPreviewPath && !pathExists[previewPath];
                const statusLines = [
                  row.fixes && { text: "Fixes", alert: fixedOutputExists },
                  row.preview && { text: "Make Preview", alert: previewOutputExists },
                  row.telegram && { text: "Send to TG", alert: false },
                  missingPreviewForSend && { text: "нет __preview файла для отправки", alert: true },
                  row.workflowStatus && { text: row.workflowStatus, alert: row.workflowStatus.includes("Ошибка") },
                ].filter(Boolean) as Array<{ text: string; alert: boolean }>;
                const outputLines = [
                  { text: row.path, alert: false },
                  outputPath && { text: outputPath, alert: outputExists },
                  displayPreviewPath && { text: displayPreviewPath, alert: displayPreviewExists },
                ].filter(Boolean) as Array<{ text: string; alert: boolean }>;

                return (
                  <TableRow className={row.fixes || row.preview || row.telegram ? "" : "inactive"} key={row.id}>
                    <TableCell>
                      <Checkbox
                        checked={row.fixes}
                        disabled={running}
                        onCheckedChange={(checked) => updateRow(row.path, { fixes: checked === true })}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.preview}
                        disabled={running}
                        onCheckedChange={(checked) => updateRow(row.path, { preview: checked === true })}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={row.telegram}
                        disabled={running}
                        onCheckedChange={(checked) => updateRow(row.path, { telegram: checked === true })}
                      />
                    </TableCell>
                    <TableCell className="meta">
                      {row.metadataStatus === "loading"
                        ? "..."
                        : row.metadataStatus === "ready" && row.metadata
                          ? `${row.metadata.resolution}\n${row.metadata.frames ?? "?"}F`
                          : "-"}
                    </TableCell>
                    <TableCell className="path">
                      {outputLines.map((line) => (
                        <div className={line.alert ? "alert" : ""} key={line.text} title={line.text}>
                          {line.text}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="status">
                      {statusLines.map((line) => (
                        <div className={line.alert ? "alert" : ""} key={line.text}>
                          {line.text}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="actions">
                      <Button
                        aria-label="Показать в папке"
                        size="icon"
                        title="Показать в папке"
                        type="button"
                        variant="outline"
                        onClick={() => reveal(row.path)}
                      >
                        <FolderOpen />
                      </Button>
                      <Button
                        aria-label="Открыть"
                        size="icon"
                        title="Открыть"
                        type="button"
                        variant="outline"
                        onClick={() => openInSystem(row.path)}
                      >
                        <ExternalLink />
                      </Button>
                      <Button
                        aria-label="Убрать из списка"
                        disabled={running}
                        size="icon"
                        title="Убрать из списка"
                        type="button"
                        variant="outline"
                        onClick={() => removeRow(row.path)}
                      >
                        <X />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Panel>

      <Panel className="logCompact">
        <div className="logCompactBody" ref={compactLogRef}>
          {log.slice(-4).map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
        <Button size="sm" type="button" variant="outline" onClick={openLogWindow}>
          <List />
          Логи
        </Button>
      </Panel>

      <footer className="statusBar">
        <progress max={100} value={progressPercent} />
        <span>{progress.total > 0 ? `${progress.completed}/${progress.total}` : statusText}</span>
      </footer>
    </main>
  );
}

function LogWindow() {
  const [lines, setLines] = useState<string[]>(() => readStoredLog());
  const bodyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === logStorageKey) {
        setLines(readStoredLog());
      }
    };

    const interval = window.setInterval(() => setLines(readStoredLog()), 1000);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <main className="logWindow">
      <header>
        <h1>PP18 Video Tools Log</h1>
        <span>{lines.length}</span>
      </header>
      <section className="logWindowBody" ref={bodyRef}>
        {lines.length === 0 ? (
          <div className="empty">Лог пуст</div>
        ) : (
          lines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)
        )}
      </section>
    </main>
  );
}

const isLogWindow = window.location.hash === "#logs";
prepareSessionLog(isLogWindow);

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>{isLogWindow ? <LogWindow /> : <App />}</AppErrorBoundary>,
);
