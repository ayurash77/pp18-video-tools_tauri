use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize)]
struct ToolInfo {
    name: String,
    path: Option<String>,
    exists: bool,
}

#[derive(Serialize)]
struct VideoMetadata {
    resolution: String,
    fps: Option<f64>,
    frames: Option<i64>,
    duration: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessingOptions {
    remove_dupes: bool,
    duplicate_mode: DuplicateMode,
    convert_to_25_fps: bool,
    existing_mode: ExistingMode,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionRow {
    id: String,
    path: String,
    fixes: bool,
    preview: bool,
    telegram: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunActionsRequest {
    rows: Vec<ActionRow>,
    options: ProcessingOptions,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum DuplicateMode {
    Soft,
    Medium,
    Aggressive,
    VeryAggressive,
    Maximum,
}

#[derive(Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum ExistingMode {
    Skip,
    Overwrite,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PathExistence {
    path: String,
    exists: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunSummary {
    ok: bool,
    completed: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WorkflowEvent {
    row_id: Option<String>,
    phase: String,
    status: String,
    message: String,
    completed: usize,
    total: usize,
    output: Option<String>,
}

#[derive(Deserialize, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct TelegramSettings {
    bot_token: String,
    chat_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TelegramSettingsState {
    bot_token: String,
    chat_id: String,
    has_bot_token: bool,
    has_chat_id: bool,
}

#[derive(Clone, Default)]
struct WorkflowControl {
    cancelled: Arc<AtomicBool>,
    current_child: Arc<Mutex<Option<u32>>>,
}

impl WorkflowControl {
    fn reset(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
        self.clear_current_child_any();
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(pid) = self.current_child.lock().ok().and_then(|child| *child) {
            let _ = terminate_process(pid);
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    fn set_current_child(&self, pid: u32) {
        if let Ok(mut child) = self.current_child.lock() {
            *child = Some(pid);
        }
    }

    fn clear_current_child(&self, pid: u32) {
        if let Ok(mut child) = self.current_child.lock() {
            if *child == Some(pid) {
                *child = None;
            }
        }
    }

    fn clear_current_child_any(&self) {
        if let Ok(mut child) = self.current_child.lock() {
            *child = None;
        }
    }
}

#[tauri::command]
fn tool_status(app: AppHandle) -> Vec<ToolInfo> {
    ["ffmpeg", "ffprobe"]
        .iter()
        .map(|name| {
            let path = find_tool(&app, name);
            ToolInfo {
                name: (*name).to_string(),
                exists: path.is_some(),
                path: path.map(|path| path.to_string_lossy().to_string()),
            }
        })
        .collect()
}

#[tauri::command]
fn probe_video(app: AppHandle, path: String) -> Result<VideoMetadata, String> {
    let ffprobe = find_tool(&app, "ffprobe").ok_or_else(|| "ffprobe не найден".to_string())?;
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,avg_frame_rate,r_frame_rate,nb_frames,duration",
            "-of",
            "default=noprint_wrappers=1",
            &path,
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    parse_metadata(&String::from_utf8_lossy(&output.stdout))
}

#[tauri::command]
fn video_thumbnail(app: AppHandle, path: String) -> Result<String, String> {
    let ffmpeg = find_tool(&app, "ffmpeg").ok_or_else(|| "ffmpeg не найден".to_string())?;
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Не удалось открыть cache dir: {error}"))?
        .join("thumbs");
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Не удалось создать папку thumbnail cache: {error}"))?;

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    let output_path = cache_dir.join(format!("{:016x}.jpg", hasher.finish()));
    if output_path.is_file() {
        return Ok(output_path.to_string_lossy().to_string());
    }

    let output_string = output_path.to_string_lossy().to_string();
    let output = Command::new(ffmpeg)
        .args([
            "-y",
            "-ss",
            "00:00:01",
            "-i",
            &path,
            "-frames:v",
            "1",
            "-vf",
            "scale=424:240:force_original_aspect_ratio=increase,crop=424:240",
            "-q:v",
            "3",
            &output_string,
        ])
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn telegram_settings(app: AppHandle) -> Result<TelegramSettingsState, String> {
    let settings = load_telegram_settings(&app)?;
    Ok(TelegramSettingsState {
        has_bot_token: !settings.bot_token.is_empty(),
        has_chat_id: !settings.chat_id.is_empty(),
        bot_token: settings.bot_token,
        chat_id: settings.chat_id,
    })
}

#[tauri::command]
fn save_telegram_settings(
    app: AppHandle,
    settings: TelegramSettings,
) -> Result<TelegramSettingsState, String> {
    let cleaned = TelegramSettings {
        bot_token: settings.bot_token.trim().to_string(),
        chat_id: settings.chat_id.trim().to_string(),
    };

    let path = telegram_settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Не удалось создать папку настроек: {error}"))?;
    }

    let body = serde_json::to_string_pretty(&cleaned)
        .map_err(|error| format!("Не удалось сериализовать настройки Telegram: {error}"))?;
    fs::write(&path, body)
        .map_err(|error| format!("Не удалось сохранить настройки Telegram: {error}"))?;
    write_telegram_env_file(&app, &cleaned)?;

    Ok(TelegramSettingsState {
        has_bot_token: !cleaned.bot_token.is_empty(),
        has_chat_id: !cleaned.chat_id.is_empty(),
        bot_token: cleaned.bot_token,
        chat_id: cleaned.chat_id,
    })
}

#[tauri::command]
fn path_existence(paths: Vec<String>) -> Vec<PathExistence> {
    paths
        .into_iter()
        .map(|path| PathExistence {
            exists: Path::new(&path).exists(),
            path,
        })
        .collect()
}

#[tauri::command]
fn folder_files(path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let entries = fs::read_dir(&path)
        .map_err(|error| format!("Не удалось прочитать папку {}: {error}", native_path(&path)))?;

    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Не удалось прочитать элемент папки: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Не удалось определить тип файла: {error}"))?;
        if file_type.is_file() {
            files.push(entry.path().to_string_lossy().to_string());
        }
    }

    files.sort_by_key(|path| path.to_lowercase());
    Ok(files)
}

#[tauri::command]
async fn run_actions(
    app: AppHandle,
    control: tauri::State<'_, WorkflowControl>,
    request: RunActionsRequest,
) -> Result<RunSummary, String> {
    let control = control.inner().clone();
    control.reset();
    tauri::async_runtime::spawn_blocking(move || run_actions_sync(app, request, control))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn cancel_actions(control: tauri::State<'_, WorkflowControl>) {
    control.cancel();
}

#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(target_os = "macos")]
    {
        open_command_status(Command::new("/usr/bin/open").args(["-R", &path]).status())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        open_command_status(
            Command::new("xdg-open")
                .arg(
                    std::path::Path::new(&path)
                        .parent()
                        .unwrap_or_else(|| std::path::Path::new(&path)),
                )
                .status(),
        )
    }
}

#[tauri::command]
fn open_in_system_player(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(target_os = "macos")]
    {
        open_command_status(Command::new("/usr/bin/open").arg(path).status())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        open_command_status(Command::new("xdg-open").arg(path).status())
    }
}

fn open_command_status(status: std::io::Result<std::process::ExitStatus>) -> Result<(), String> {
    status
        .map_err(|error| error.to_string())
        .and_then(|status| {
            status
                .success()
                .then_some(())
                .ok_or_else(|| "Команда открытия завершилась с ошибкой".to_string())
        })
}

fn load_telegram_settings(app: &AppHandle) -> Result<TelegramSettings, String> {
    let mut settings = telegram_settings_path(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|body| serde_json::from_str::<TelegramSettings>(&body).ok())
        .unwrap_or_default();

    if let Some(env_file) = read_telegram_env_file(app) {
        if let Some(token) = env_file.get("TG_PP18NOTIFIER_BOT_TOKEN") {
            settings.bot_token = token.clone();
        }
        if let Some(chat_id) = env_file.get("TG_PP18OUT_CHAT_ID") {
            settings.chat_id = chat_id.clone();
        }
    }

    if let Ok(token) = std::env::var("TG_PP18NOTIFIER_BOT_TOKEN") {
        if !token.is_empty() {
            settings.bot_token = token;
        }
    }
    if let Ok(chat_id) = std::env::var("TG_PP18OUT_CHAT_ID") {
        if !chat_id.is_empty() {
            settings.chat_id = chat_id;
        }
    }

    Ok(settings)
}

fn telegram_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("telegram-settings.json"))
        .map_err(|error| format!("Не удалось определить папку настроек: {error}"))
}

fn read_telegram_env_file(app: &AppHandle) -> Option<HashMap<String, String>> {
    telegram_env_file_candidates(app)
        .into_iter()
        .find(|path| path.is_file())
        .and_then(|path| fs::read_to_string(path).ok())
        .map(|body| parse_env_file(&body))
}

fn write_telegram_env_file(app: &AppHandle, settings: &TelegramSettings) -> Result<(), String> {
    let path = preferred_telegram_env_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Не удалось создать папку для .env: {error}"))?;
    }

    let mut lines = path
        .is_file()
        .then(|| fs::read_to_string(&path).unwrap_or_default())
        .unwrap_or_default()
        .lines()
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    upsert_env_line(&mut lines, "TG_PP18NOTIFIER_BOT_TOKEN", &settings.bot_token);
    upsert_env_line(&mut lines, "TG_PP18OUT_CHAT_ID", &settings.chat_id);

    let mut body = lines.join("\n");
    body.push('\n');
    fs::write(&path, body).map_err(|error| {
        format!(
            "Не удалось записать Telegram настройки в {}: {error}",
            native_path(&path)
        )
    })
}

fn preferred_telegram_env_path(app: &AppHandle) -> PathBuf {
    telegram_env_file_candidates(app)
        .into_iter()
        .find(|path| path.is_file())
        .unwrap_or_else(|| {
            project_root_env_path()
                .or_else(|| std::env::current_dir().ok().map(|dir| dir.join(".env")))
                .unwrap_or_else(|| PathBuf::from(".env"))
        })
}

fn telegram_env_file_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(path) = project_root_env_path() {
        candidates.push(path);
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join(".env"));
        if let Some(parent) = current_dir.parent() {
            candidates.push(parent.join(".env"));
        }
    }

    if let Ok(config_dir) = app.path().app_config_dir() {
        candidates.push(config_dir.join(".env"));
    }

    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

fn project_root_env_path() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").ok()?);
    manifest_dir.parent().map(|project| project.join(".env"))
}

fn parse_env_file(body: &str) -> HashMap<String, String> {
    body.lines()
        .filter_map(parse_env_line)
        .collect::<HashMap<_, _>>()
}

fn parse_env_line(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    let line = line.strip_prefix("export ").unwrap_or(line);
    let (key, value) = line.split_once('=')?;
    let key = key.trim();
    if key.is_empty() {
        return None;
    }

    Some((key.to_string(), unquote_env_value(value.trim())))
}

fn unquote_env_value(value: &str) -> String {
    if value.len() >= 2 {
        let bytes = value.as_bytes();
        if (bytes[0] == b'"' && bytes[value.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[value.len() - 1] == b'\'')
        {
            return value[1..value.len() - 1].to_string();
        }
    }
    value.to_string()
}

fn upsert_env_line(lines: &mut Vec<String>, key: &str, value: &str) {
    let next = format!("{key}={}", format_env_value(value));
    if let Some(line) = lines
        .iter_mut()
        .find(|line| env_line_key(line).is_some_and(|line_key| line_key == key))
    {
        *line = next;
    } else {
        lines.push(next);
    }
}

fn env_line_key(line: &str) -> Option<String> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }

    let line = line.strip_prefix("export ").unwrap_or(line);
    line.split_once('=').map(|(key, _)| key.trim().to_string())
}

fn format_env_value(value: &str) -> String {
    if value
        .chars()
        .all(|character| !character.is_whitespace() && character != '#' && character != '"')
    {
        return value.to_string();
    }

    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn run_actions_sync(
    app: AppHandle,
    request: RunActionsRequest,
    control: WorkflowControl,
) -> Result<RunSummary, String> {
    let ffmpeg = find_tool(&app, "ffmpeg").ok_or_else(|| "ffmpeg не найден".to_string())?;
    let fix_rows: Vec<&ActionRow> = request.rows.iter().filter(|row| row.fixes).collect();
    let total = fix_rows.len()
        + request.rows.iter().filter(|row| row.preview).count()
        + request.rows.iter().filter(|row| row.telegram).count();
    let mut completed = 0;
    let mut ok = true;

    emit_workflow(
        &app,
        WorkflowEvent {
            row_id: None,
            phase: "workflow".to_string(),
            status: "started".to_string(),
            message: format!("В очереди действий: {total}"),
            completed,
            total,
            output: None,
        },
    );

    if total == 0 {
        emit_workflow(
            &app,
            WorkflowEvent {
                row_id: None,
                phase: "workflow".to_string(),
                status: "finished".to_string(),
                message: "Нет выбранных действий.".to_string(),
                completed,
                total,
                output: None,
            },
        );
        return Ok(RunSummary {
            ok: false,
            completed,
            total,
        });
    }

    let mut fixed_ok = HashSet::new();
    for row in fix_rows {
        if control.is_cancelled() {
            return Ok(finish_cancelled(&app, completed, total));
        }

        let fixed = make_fixed_path(&row.path)?;
        emit_workflow(
            &app,
            WorkflowEvent {
                row_id: Some(row.id.clone()),
                phase: "fixes".to_string(),
                status: "running".to_string(),
                message: format!("Fixes: {}", native_path(&row.path)),
                completed,
                total,
                output: Some(fixed.clone()),
            },
        );

        match run_fix(&ffmpeg, &row.path, &fixed, &request.options, &control) {
            Ok(ProcessOutcome::Done(details)) => {
                fixed_ok.insert(row.path.clone());
                emit_workflow(
                    &app,
                    WorkflowEvent {
                        row_id: Some(row.id.clone()),
                        phase: "fixes".to_string(),
                        status: "done".to_string(),
                        message: if details.is_empty() {
                            format!("Готово: {}", native_path(&fixed))
                        } else {
                            details
                        },
                        completed: completed + 1,
                        total,
                        output: Some(fixed),
                    },
                );
            }
            Ok(ProcessOutcome::Skipped(details)) => {
                fixed_ok.insert(row.path.clone());
                emit_workflow(
                    &app,
                    WorkflowEvent {
                        row_id: Some(row.id.clone()),
                        phase: "fixes".to_string(),
                        status: "skipped".to_string(),
                        message: details,
                        completed: completed + 1,
                        total,
                        output: Some(fixed),
                    },
                );
            }
            Err(error) => {
                ok = false;
                emit_workflow(
                    &app,
                    WorkflowEvent {
                        row_id: Some(row.id.clone()),
                        phase: "fixes".to_string(),
                        status: if control.is_cancelled() {
                            "cancelled".to_string()
                        } else {
                            "error".to_string()
                        },
                        message: error,
                        completed: completed + 1,
                        total,
                        output: Some(fixed),
                    },
                );
            }
        }
        completed += 1;
        if control.is_cancelled() {
            return Ok(finish_cancelled(&app, completed, total));
        }
    }

    for row in &request.rows {
        if control.is_cancelled() {
            return Ok(finish_cancelled(&app, completed, total));
        }

        if !row.preview && !row.telegram {
            continue;
        }

        let Some(input) = preview_source_for_row(row, &fixed_ok)? else {
            if row.preview {
                ok = false;
                completed += emit_row_event(
                    &app,
                    row,
                    "preview",
                    "error",
                    "Preview пропущен: fixed output не создан.",
                    completed + 1,
                    total,
                    Some(make_fixed_path(&row.path)?),
                );
            }
            if row.telegram {
                ok = false;
                completed += emit_row_event(
                    &app,
                    row,
                    "telegram",
                    "error",
                    "TG пропущен: fixed output не создан.",
                    completed + 1,
                    total,
                    Some(make_fixed_path(&row.path)?),
                );
            }
            continue;
        };

        let output = make_preview_path(&input)?;
        if row.preview {
            emit_workflow(
                &app,
                WorkflowEvent {
                    row_id: Some(row.id.clone()),
                    phase: "preview".to_string(),
                    status: "running".to_string(),
                    message: format!("Превью: {}", native_path(&input)),
                    completed,
                    total,
                    output: Some(output.clone()),
                },
            );

            match run_preview(&ffmpeg, &input, &output, &control) {
                Ok(details) => {
                    emit_workflow(
                        &app,
                        WorkflowEvent {
                            row_id: Some(row.id.clone()),
                            phase: "preview".to_string(),
                            status: "done".to_string(),
                            message: if details.is_empty() {
                                format!("Превью готово: {}", native_path(&output))
                            } else {
                                details
                            },
                            completed: completed + 1,
                            total,
                            output: Some(output.clone()),
                        },
                    );
                    completed += 1;
                }
                Err(error) => {
                    ok = false;
                    emit_workflow(
                        &app,
                        WorkflowEvent {
                            row_id: Some(row.id.clone()),
                            phase: "preview".to_string(),
                            status: if control.is_cancelled() {
                                "cancelled".to_string()
                            } else {
                                "error".to_string()
                            },
                            message: error,
                            completed: completed + 1,
                            total,
                            output: Some(output.clone()),
                        },
                    );
                    completed += 1;
                    if row.telegram {
                        completed += emit_row_event(
                            &app,
                            row,
                            "telegram",
                            "error",
                            "TG пропущен: preview не создан.",
                            completed + 1,
                            total,
                            Some(output.clone()),
                        );
                    }
                    continue;
                }
            }
            if control.is_cancelled() {
                return Ok(finish_cancelled(&app, completed, total));
            }
        }

        if row.telegram {
            if control.is_cancelled() {
                return Ok(finish_cancelled(&app, completed, total));
            }

            emit_workflow(
                &app,
                WorkflowEvent {
                    row_id: Some(row.id.clone()),
                    phase: "telegram".to_string(),
                    status: "running".to_string(),
                    message: format!("Отправка видео в Telegram: {}", native_path(&output)),
                    completed,
                    total,
                    output: Some(output.clone()),
                },
            );

            match send_telegram_video(&app, &output, &row.path) {
                Ok(()) => {
                    emit_workflow(
                        &app,
                        WorkflowEvent {
                            row_id: Some(row.id.clone()),
                            phase: "telegram".to_string(),
                            status: "done".to_string(),
                            message: format!("Telegram отправил: {}", native_path(&output)),
                            completed: completed + 1,
                            total,
                            output: Some(output),
                        },
                    );
                }
                Err(error) => {
                    ok = false;
                    emit_workflow(
                        &app,
                        WorkflowEvent {
                            row_id: Some(row.id.clone()),
                            phase: "telegram".to_string(),
                            status: "error".to_string(),
                            message: error,
                            completed: completed + 1,
                            total,
                            output: Some(output),
                        },
                    );
                }
            }
            completed += 1;
        }
    }

    emit_workflow(
        &app,
        WorkflowEvent {
            row_id: None,
            phase: "workflow".to_string(),
            status: "finished".to_string(),
            message: if ok {
                "Готово.".to_string()
            } else {
                "Операция завершена с ошибкой или не полностью.".to_string()
            },
            completed,
            total,
            output: None,
        },
    );

    Ok(RunSummary {
        ok,
        completed,
        total,
    })
}

fn preview_source_for_row(
    row: &ActionRow,
    fixed_ok: &HashSet<String>,
) -> Result<Option<String>, String> {
    if row.fixes {
        let fixed = make_fixed_path(&row.path)?;
        if !fixed_ok.contains(&row.path) && !Path::new(&fixed).exists() {
            return Ok(None);
        }
        Ok(Some(fixed))
    } else {
        Ok(Some(row.path.clone()))
    }
}

fn emit_row_event(
    app: &AppHandle,
    row: &ActionRow,
    phase: &str,
    status: &str,
    message: &str,
    completed: usize,
    total: usize,
    output: Option<String>,
) -> usize {
    emit_workflow(
        app,
        WorkflowEvent {
            row_id: Some(row.id.clone()),
            phase: phase.to_string(),
            status: status.to_string(),
            message: message.to_string(),
            completed,
            total,
            output,
        },
    );
    1
}

fn finish_cancelled(app: &AppHandle, completed: usize, total: usize) -> RunSummary {
    emit_workflow(
        app,
        WorkflowEvent {
            row_id: None,
            phase: "workflow".to_string(),
            status: "finished".to_string(),
            message: "Операция отменена.".to_string(),
            completed,
            total,
            output: None,
        },
    );
    RunSummary {
        ok: false,
        completed,
        total,
    }
}

fn send_telegram_video(
    app: &AppHandle,
    file_path: &str,
    original_path: &str,
) -> Result<(), String> {
    let settings = load_telegram_settings(app)?;
    if settings.bot_token.is_empty() || settings.chat_id.is_empty() {
        return Err("Telegram: не задан TOKEN или CHAT_ID".to_string());
    }

    let file = Path::new(file_path);
    if !file.is_file() {
        return Err(format!(
            "Telegram: файл не найден: {}",
            native_path(file_path)
        ));
    }

    let filename = file
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("preview.mp4")
        .to_string();
    let url = format!(
        "https://api.telegram.org/bot{}/sendVideo",
        settings.bot_token
    );
    let reply_markup = telegram_reply_markup(original_path)?;
    let video_part = reqwest::blocking::multipart::Part::file(file)
        .map_err(|error| format!("Telegram: не удалось открыть файл: {error}"))?
        .file_name(filename)
        .mime_str("video/mp4")
        .map_err(|error| format!("Telegram: неверный mime type: {error}"))?;
    let form = reqwest::blocking::multipart::Form::new()
        .text("chat_id", settings.chat_id)
        .text("parse_mode", "HTML")
        .text("caption", make_caption_html(original_path))
        .text("supports_streaming", "true")
        .text("reply_markup", reply_markup)
        .part("video", video_part);

    let response = reqwest::blocking::Client::new()
        .post(url)
        .multipart(form)
        .send()
        .map_err(|error| format!("Ошибка Telegram: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Telegram: не удалось прочитать ответ: {error}"))?;

    if !status.is_success() {
        return Err(format!("Ошибка Telegram HTTP {status}: {body}"));
    }

    let value: serde_json::Value = serde_json::from_str(&body)
        .map_err(|error| format!("Telegram: неверный JSON ответ: {error}; {body}"))?;
    if value.get("ok").and_then(|ok| ok.as_bool()) == Some(true) {
        Ok(())
    } else {
        Err(format!("Ответ Telegram: {body}"))
    }
}

fn make_caption_html(input: &str) -> String {
    format!("<code>{}</code>", escape_html(&short_display_path(input)))
}

fn telegram_reply_markup(input: &str) -> Result<String, String> {
    let (mac_path, windows_path) = telegram_copy_paths(input);
    let reply_markup = serde_json::json!({
        "inline_keyboard": [[
            { "text": "MacOS path", "copy_text": { "text": mac_path } },
            { "text": "Win path", "copy_text": { "text": windows_path } }
        ]]
    });
    serde_json::to_string(&reply_markup).map_err(|error| error.to_string())
}

fn telegram_copy_paths(input: &str) -> (String, String) {
    let path = native_path(input);
    if let Some(rest) = mac_work_path_rest(&path) {
        return (mac_work_path(&rest), windows_work_path(&rest));
    }
    if let Some(rest) = windows_work_path_rest(&path) {
        return (mac_work_path(&rest), windows_work_path(&rest));
    }

    (path.clone(), path)
}

fn short_display_path(file_path: &str) -> String {
    let path = Path::new(file_path);
    let Some(parent) = path.parent() else {
        return format!("/{}", native_path(file_path));
    };
    let Some(two_levels_up) = parent.parent() else {
        return format!(
            "/{}",
            path.file_name().unwrap_or_default().to_string_lossy()
        );
    };
    let root_name = two_levels_up
        .file_name()
        .map(|value| value.to_string_lossy())
        .unwrap_or_default();
    let relative = path
        .strip_prefix(two_levels_up)
        .unwrap_or(path)
        .to_string_lossy();
    if root_name.is_empty() {
        format!("/{relative}")
    } else {
        format!("/{root_name}/{relative}")
    }
}

fn mac_work_path_rest(path: &str) -> Option<String> {
    const MAC_WORK_PREFIX: &str = "/Volumes/work";
    if path == MAC_WORK_PREFIX {
        Some(String::new())
    } else {
        path.strip_prefix(&format!("{MAC_WORK_PREFIX}/"))
            .map(|rest| rest.to_string())
    }
}

fn windows_work_path_rest(path: &str) -> Option<String> {
    let normalized = path.replace('/', "\\");
    let lower = normalized.to_lowercase();
    if lower == "w:" || lower == "w:\\" {
        return Some(String::new());
    }
    if lower.starts_with("w:\\") {
        Some(
            normalized["w:\\".len()..]
                .trim_start_matches('\\')
                .to_string(),
        )
    } else {
        None
    }
}

fn mac_work_path(rest: &str) -> String {
    let rest = rest.replace('\\', "/");
    let rest = rest.trim_start_matches('/');
    if rest.is_empty() {
        "/Volumes/work".to_string()
    } else {
        format!("/Volumes/work/{rest}")
    }
}

fn windows_work_path(rest: &str) -> String {
    let rest = rest.replace('/', "\\");
    let rest = rest.trim_start_matches('\\');
    if rest.is_empty() {
        "w:\\".to_string()
    } else {
        format!("w:\\{rest}")
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telegram_copy_paths_from_mac_work_path() {
        let (mac_path, windows_path) =
            telegram_copy_paths("/Volumes/work/2026-2/Vyazanka/out/VYAZ_040_v00.mov");

        assert_eq!(
            mac_path,
            "/Volumes/work/2026-2/Vyazanka/out/VYAZ_040_v00.mov"
        );
        assert_eq!(windows_path, "w:\\2026-2\\Vyazanka\\out\\VYAZ_040_v00.mov");
    }

    #[test]
    fn telegram_copy_paths_from_windows_work_path() {
        let (mac_path, windows_path) =
            telegram_copy_paths(r"W:\2026-2\Vyazanka\out\VYAZ_040_v00.mov");

        assert_eq!(
            mac_path,
            "/Volumes/work/2026-2/Vyazanka/out/VYAZ_040_v00.mov"
        );
        assert_eq!(windows_path, "w:\\2026-2\\Vyazanka\\out\\VYAZ_040_v00.mov");
    }

    #[test]
    fn telegram_copy_paths_keep_unmapped_path() {
        let (mac_path, windows_path) = telegram_copy_paths(r"D:\media\file.mov");

        assert_eq!(mac_path, r"D:\media\file.mov");
        assert_eq!(windows_path, r"D:\media\file.mov");
    }
}

enum ProcessOutcome {
    Done(String),
    Skipped(String),
}

fn run_fix(
    ffmpeg: &Path,
    input: &str,
    output: &str,
    options: &ProcessingOptions,
    control: &WorkflowControl,
) -> Result<ProcessOutcome, String> {
    let output_path = Path::new(output);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("Не удалось создать папку {}: {error}", native_path(parent))
        })?;
    }

    if output_path.exists() {
        if options.existing_mode == ExistingMode::Skip {
            return Ok(ProcessOutcome::Skipped(format!(
                "Пропущено, уже существует: {}",
                native_path(output)
            )));
        }
        fs::remove_file(output_path)
            .map_err(|error| format!("Не удалось удалить {}: {error}", native_path(output)))?;
    }

    let mut command = Command::new(ffmpeg);
    command.args(build_fix_args(input, output, options));
    let output_result = run_controlled_command(control, &mut command)?;

    let details = process_output_text(&output_result);
    if output_result.status.success() && output_path.exists() {
        Ok(ProcessOutcome::Done(details))
    } else {
        let _ = fs::remove_file(output_path);
        Err(if details.is_empty() {
            format!("Ошибка при обработке: {}", native_path(input))
        } else {
            details
        })
    }
}

fn run_preview(
    ffmpeg: &Path,
    input: &str,
    output: &str,
    control: &WorkflowControl,
) -> Result<String, String> {
    if !Path::new(input).exists() {
        return Err(format!("Файл для превью не найден: {}", native_path(input)));
    }

    let output_path = Path::new(output);
    if output_path.exists() {
        fs::remove_file(output_path)
            .map_err(|error| format!("Не удалось удалить {}: {error}", native_path(output)))?;
    }

    let mut command = Command::new(ffmpeg);
    command.args([
        "-y",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "superfast",
        "-crf",
        "23",
        "-profile:v",
        "main",
        "-level",
        "4.0",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        output,
    ]);
    let output_result = run_controlled_command(control, &mut command)?;

    let details = process_output_text(&output_result);
    if output_result.status.success() && output_path.exists() {
        Ok(details)
    } else {
        let _ = fs::remove_file(output_path);
        Err(if details.is_empty() {
            format!("Ошибка при создании превью: {}", native_path(input))
        } else {
            details
        })
    }
}

fn run_controlled_command(
    control: &WorkflowControl,
    command: &mut Command,
) -> Result<Output, String> {
    if control.is_cancelled() {
        return Err("Операция отменена.".to_string());
    }

    let child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Не удалось запустить ffmpeg: {error}"))?;
    let pid = child.id();
    control.set_current_child(pid);

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Не удалось дождаться завершения ffmpeg: {error}"));
    control.clear_current_child(pid);

    if control.is_cancelled() {
        return Err("Операция отменена.".to_string());
    }

    output
}

#[cfg(unix)]
fn terminate_process(pid: u32) -> Result<(), String> {
    Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status()
        .map_err(|error| format!("Не удалось остановить процесс {pid}: {error}"))?
        .success()
        .then_some(())
        .ok_or_else(|| format!("Не удалось остановить процесс {pid}"))
}

#[cfg(windows)]
fn terminate_process(pid: u32) -> Result<(), String> {
    Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status()
        .map_err(|error| format!("Не удалось остановить процесс {pid}: {error}"))?
        .success()
        .then_some(())
        .ok_or_else(|| format!("Не удалось остановить процесс {pid}"))
}

fn build_fix_args(input: &str, output: &str, options: &ProcessingOptions) -> Vec<String> {
    let mut args = vec!["-y".to_string(), "-i".to_string(), input.to_string()];

    if let Some(vf) = video_filter(options) {
        args.push("-vf".to_string());
        args.push(vf);
        if options.convert_to_25_fps {
            args.push("-r".to_string());
            args.push("25".to_string());
        }
    }

    args.extend(
        [
            "-c:v",
            "prores_ks",
            "-profile:v",
            "3",
            "-c:a",
            "pcm_s16le",
            output,
        ]
        .into_iter()
        .map(String::from),
    );

    args
}

fn video_filter(options: &ProcessingOptions) -> Option<String> {
    let mut filters = Vec::new();
    if options.remove_dupes {
        filters.push(duplicate_filter(&options.duplicate_mode).to_string());
    }

    if options.convert_to_25_fps {
        filters.push("setpts=N/(25*TB)".to_string());
    } else if options.remove_dupes {
        filters.push("setpts=N/FRAME_RATE/TB".to_string());
    }

    (!filters.is_empty()).then(|| filters.join(","))
}

fn duplicate_filter(mode: &DuplicateMode) -> &'static str {
    match mode {
        DuplicateMode::Soft => "mpdecimate=hi=768:lo=320:frac=0.33",
        DuplicateMode::Medium => "mpdecimate=hi=1024:lo=512:frac=0.45",
        DuplicateMode::VeryAggressive => "hqdn3d=4:3:6:4,mpdecimate=hi=2048:lo=1024:frac=0.75",
        DuplicateMode::Maximum => "hqdn3d=4:3:6:4,mpdecimate=hi=4096:lo=2048:frac=0.85",
        DuplicateMode::Aggressive => "mpdecimate=hi=2048:lo=1024:frac=0.75",
    }
}

fn make_fixed_path(input: &str) -> Result<String, String> {
    let path = Path::new(input);
    let parent = path
        .parent()
        .ok_or_else(|| format!("Не удалось определить папку файла: {input}"))?;
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("Не удалось определить имя файла: {input}"))?;
    Ok(parent
        .join("fixed")
        .join(format!("{stem}.mov"))
        .to_string_lossy()
        .to_string())
}

fn make_preview_path(input: &str) -> Result<String, String> {
    let path = Path::new(input);
    let parent = path
        .parent()
        .ok_or_else(|| format!("Не удалось определить папку файла: {input}"))?;
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("Не удалось определить имя файла: {input}"))?;
    Ok(parent
        .join(format!("{stem}__preview.mp4"))
        .to_string_lossy()
        .to_string())
}

fn process_output_text(output: &std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout,
        (true, false) => stderr,
        (false, false) => format!("{stdout}\n{stderr}"),
    }
}

fn emit_workflow(app: &AppHandle, event: WorkflowEvent) {
    let _ = app.emit("workflow-event", event);
}

fn find_tool(app: &AppHandle, base_name: &str) -> Option<PathBuf> {
    let executable_name = if cfg!(target_os = "windows") && !base_name.ends_with(".exe") {
        format!("{base_name}.exe")
    } else {
        base_name.to_string()
    };

    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("bin").join(&executable_name));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("bin").join(&executable_name));
            candidates.push(exe_dir.join("../Resources/bin").join(&executable_name));
        }
    }

    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let manifest_dir = PathBuf::from(manifest_dir);
        candidates.push(manifest_dir.join("bin").join(&executable_name));
        candidates.push(
            manifest_dir
                .join("../../pp18-video-tools_qt/bin")
                .join(&executable_name),
        );
        candidates.push(
            manifest_dir
                .join("../../pp18-video-tools_cli/bin")
                .join(&executable_name),
        );
    }

    candidates.into_iter().find(|path| path.is_file())
}

fn native_path(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().to_string()
}

fn parse_metadata(output: &str) -> Result<VideoMetadata, String> {
    let mut width = None;
    let mut height = None;
    let mut nb_frames = None;
    let mut duration = None;
    let mut avg_frame_rate = None;
    let mut r_frame_rate = None;

    for line in output.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        match key {
            "width" => width = value.parse::<i64>().ok(),
            "height" => height = value.parse::<i64>().ok(),
            "nb_frames" => nb_frames = value.parse::<i64>().ok(),
            "duration" => duration = value.parse::<f64>().ok(),
            "avg_frame_rate" => avg_frame_rate = parse_frame_rate(value),
            "r_frame_rate" => r_frame_rate = parse_frame_rate(value),
            _ => {}
        }
    }

    let resolution = match (width, height) {
        (Some(width), Some(height)) => format!("{width}x{height}"),
        _ => "?".to_string(),
    };

    let fps = avg_frame_rate.or(r_frame_rate);
    let frames = nb_frames.or_else(|| {
        let fps = fps?;
        let duration = duration?;
        Some((duration * fps).round() as i64)
    });

    Ok(VideoMetadata {
        resolution,
        fps,
        frames,
        duration,
    })
}

fn parse_frame_rate(value: &str) -> Option<f64> {
    if let Some((numerator, denominator)) = value.split_once('/') {
        let numerator = numerator.parse::<f64>().ok()?;
        let denominator = denominator.parse::<f64>().ok()?;
        return (denominator > 0.0).then_some(numerator / denominator);
    }

    value.parse::<f64>().ok()
}

pub fn run() {
    tauri::Builder::default()
        .manage(WorkflowControl::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            tool_status,
            probe_video,
            video_thumbnail,
            telegram_settings,
            save_telegram_settings,
            path_existence,
            folder_files,
            run_actions,
            cancel_actions,
            reveal_in_folder,
            open_in_system_player
        ])
        .run(tauri::generate_context!())
        .expect("error while running PP18 Video Tools");
}
