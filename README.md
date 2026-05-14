# PP18 Video Tools Tauri

Tauri + React desktop prototype for PP18 video workflows.

## Prerequisites

- Node.js and pnpm.
- Rust toolchain (`cargo`, `rustc`).
- Tauri system dependencies for the target OS.

## Setup

```bash
pnpm install
pnpm sync-binaries
pnpm tauri:dev
```

Telegram credentials are read from `.env` in the project root:

```text
TG_PP18NOTIFIER_BOT_TOKEN=...
TG_PP18OUT_CHAT_ID=...
```

Use `.env.example` as the template. The real `.env` is ignored by git.

`sync-binaries` copies tools from sibling projects:

```text
../pp18-video-tools_qt/bin
../pp18-video-tools_cli/bin
```

into:

```text
src-tauri/bin
```

The app also falls back to those sibling folders in development.

## Current Scope

- React UI scaffold.
- Native file selection through Tauri dialog plugin.
- Video table with `Fixes`, `Preview`, `TG` actions.
- `ffprobe` metadata loading through Rust command.
- Show in folder / open in system player.
- Tool status check for `ffmpeg` and `ffprobe`.
- Tailwind v4 + local shadcn-like UI components inspired by Shotmate.
- `Fixes` and `Preview` ffmpeg workflows with progress/log events.
- Telegram settings and `sendVideo` upload of preview files.
- Telegram credentials from editable `.env` with legacy JSON fallback.
- Stop/cancel for active ffmpeg workflows.

Thumbnails, built-in player, and full context menu parity are still pending.
