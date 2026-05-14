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
- Auto-update support through Tauri updater and GitHub Releases.

Thumbnails, built-in player, and full context menu parity are still pending.

## Release and Updates

Release builds are published by `.github/workflows/release.yml` for Windows and macOS.
The workflow uploads installer/update artifacts to GitHub Releases and generates `latest.json`
for the Tauri updater endpoint:

```text
https://github.com/ayurash77/pp18-video-tools_tauri/releases/latest/download/latest.json
```

The app checks for updates automatically on startup in production builds.

Before running the release workflow, add these GitHub Actions secrets:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` can be empty if the generated key has no password.
The current private key was generated locally at:

```text
~/.tauri/pp18-video-tools.key
```

The public key is stored in `src-tauri/tauri.conf.json`.

Create a release by bumping the version in both `package.json` and `src-tauri/Cargo.toml`
/ `src-tauri/tauri.conf.json`, then pushing a tag:

```bash
git tag v0.1.1
git push origin v0.1.1
```

`ffmpeg` and `ffprobe` binaries are not stored in Git. Local copies live in
`src-tauri/bin`, and the release workflow downloads platform binaries before
building installers.
