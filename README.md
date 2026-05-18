# PP18 Video Tools Tauri

Tauri + React desktop prototype for PP18 video workflows.

Current release: `v0.1.9`.

## Prerequisites

- Node.js and pnpm.
- Rust toolchain (`cargo`, `rustc`).
- Tauri system dependencies for the target OS.
- `ffmpeg` and `ffprobe` available through `src-tauri/bin` or sibling project fallback in development.

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

On exFAT Windows drives, `pnpm install` can fail because exFAT does not support
symlinks. Use hoisted installs for that machine:

```bash
pnpm config set node-linker hoisted
pnpm install
```

## Current Scope

- React UI scaffold.
- Native file selection through Tauri dialog plugin.
- Video table with `Fixes`, `Preview`, `TG` actions.
- File and multi-folder adding.
- Optional latest-version filter for `_v##` file names.
- `ffprobe` metadata loading through Rust command.
- Show in folder / open in system player.
- Tool status check for `ffmpeg` and `ffprobe`.
- Tailwind v4 + local shadcn-like UI components inspired by Shotmate.
- `Fixes` and `Preview` ffmpeg workflows with progress/log events.
- Telegram settings and `sendVideo` upload of preview files.
- Telegram credentials from editable `.env` with legacy JSON fallback.
- Stop/cancel for active ffmpeg workflows.
- Auto-update support through Tauri updater and GitHub Releases.
- Production Windows builds run without a console window.
- Source-file thumbnails for task cards.
- Built-in video player window with frame stepping, loop modes, and source/fix playback.
- Context menu actions for per-card playback, running, reveal/open, and removal.

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
```

The current private key was generated locally at:

```text
~/.tauri/pp18-video-tools.key
```

The public key is stored in `src-tauri/tauri.conf.json`.

For local/manual installer builds without updater artifacts, use:

```bash
pnpm tauri:build:local
```

This avoids requiring `TAURI_SIGNING_PRIVATE_KEY`. Real release builds should
continue using `pnpm tauri:build` or the GitHub release workflow with
`TAURI_SIGNING_PRIVATE_KEY` configured.

Create a release by bumping the version in all version files, committing, and
pushing a `v*` tag:

```bash
pnpm install
cargo check --manifest-path src-tauri/Cargo.toml
pnpm build
git tag v0.1.9
git push origin main v0.1.9
```

Version files:

```text
package.json
src-tauri/Cargo.toml
src-tauri/Cargo.lock
src-tauri/tauri.conf.json
```

`ffmpeg` and `ffprobe` binaries are not stored in Git. Local copies live in
`src-tauri/bin`, and the release workflow downloads platform binaries before
building installers. macOS release jobs download target-specific binaries:
`arm64` for `aarch64-apple-darwin` and `amd64` for `x86_64-apple-darwin`.
macOS bundles are ad-hoc signed with `bundle.macOS.signingIdentity: "-"` so
the app bundle has a valid resource seal. Fully trusted first-run behavior still
requires an Apple Developer ID certificate and notarization.

## Current Release Notes

`v0.1.9` is the latest release:

- GitHub release: `https://github.com/ayurash77/pp18-video-tools_tauri/releases/tag/v0.1.9`
- Telegram captions now show the source filename plus full copyable Windows and MacOS paths.
- Added a separate built-in player window with frame stepping, loop modes, Esc close, and auto-sized startup.
- `Проиграть src` uses an existing source `__preview` when available, otherwise opens the source.
- Task-card thumbnails now always come from the source file.
- Drag-and-drop adding now appends/deduplicates like the file/folder buttons.
- Fixed action-line opacity rules and TG/preview coupling when preview files are missing.
- Player/log windows close with the main window and use explicit Tauri window permissions.

`v0.1.5` was an intermediate failed release attempt: macOS jobs completed, but
the Windows job failed before `v0.1.6` fixed the compile issue.
