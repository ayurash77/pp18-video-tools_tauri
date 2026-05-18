# Agent Handoff

This file is context for continuing development in a new RustRover/Codex chat.
Read this first together with `README.md`.

Last updated: 2026-05-16.

## Project

Path:

```text
/Users/ayurash/Development/_Projects/pp18-video-tools/pp18-video-tools_tauri
```

This is the Tauri + React version of `PP18 Video Tools`.

Sibling projects:

```text
../pp18-video-tools_qt
../pp18-video-tools_cli
```

The Qt version is the current feature-complete reference implementation. The CLI project contains the original scripts/binaries reference.

Repository:

```text
https://github.com/ayurash77/pp18-video-tools_tauri.git
```

Current branch/tag state when this file was updated:

```text
main
HEAD 7deb7d5 Fix Windows release build
latest release v0.1.9
```

`v0.1.5` exists as an intermediate failed release attempt. Do not use it as the
baseline for support unless the user explicitly asks about that failed run.

## Stack

- Tauri v2
- React
- Vite
- TypeScript
- Tailwind v4
- Local shadcn-like UI components
- Rust backend commands
- pnpm package manager

Main files:

```text
package.json
README.md
.env.example
src/main.tsx
src/styles.css
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
src-tauri/src/lib.rs
src-tauri/src/main.rs
scripts/sync-binaries.mjs
.github/workflows/release.yml
```

## Current State

Implemented in the Tauri version:

- React UI scaffold.
- Native video file selection through `@tauri-apps/plugin-dialog`.
- Multi-folder selection through Tauri dialog.
- Table with `Fixes`, `Preview`, and `TG` row actions.
- Optional latest-version filtering for file names containing `_v##`.
- Latest-version filtering also re-applies to an already populated list.
- `ffprobe` metadata loading through Rust command `probe_video`.
- Tool status check for `ffmpeg` / `ffprobe` through Rust command `tool_status`.
- Existing-output checks through Rust command `path_existence`.
- `Fixes` processing pipeline through Rust command `run_actions` and `ffmpeg`.
- `Preview` creation through Rust command `run_actions` and `ffmpeg`.
- Telegram settings through Rust commands `telegram_settings` / `save_telegram_settings`.
- Telegram credentials from root `.env` keys `TG_PP18NOTIFIER_BOT_TOKEN` and `TG_PP18OUT_CHAT_ID`, with legacy JSON fallback and process env override.
- Telegram `sendVideo` upload of preview files through `run_actions`.
- Stop/cancel for active `ffmpeg` processing through Rust command `cancel_actions`.
- Progress/log/status event streaming through Tauri event `workflow-event`.
- Show in folder through Rust command `reveal_in_folder`.
- Open in system player through Rust command `open_in_system_player`.
- Windows `reveal_in_folder` uses `explorer.exe /select,...` and treats successful process spawn as success.
- Windows `open_in_system_player` uses `rundll32.exe url.dll,FileProtocolHandler` and does not go through `cmd`.
- Windows release builds hide the extra console window through `src-tauri/src/main.rs`:

```rust
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]
```

- Auto-update support through Tauri updater, GitHub Releases, and `.github/workflows/release.yml`.
- Shotmate-inspired UI tokens, local fonts, and local components in `src/components/ui`.
- Binary sync script:

```bash
pnpm sync-binaries
```

This copies from:

```text
../pp18-video-tools_qt/bin
../pp18-video-tools_cli/bin
```

into:

```text
src-tauri/bin
```

The app was successfully built as:

```text
GitHub release v0.1.6
Windows setup/MSI
macOS aarch64 DMG/app.tar.gz
macOS x64 DMG/app.tar.gz
```

## Current Limitations

The Tauri version is a working scaffold, not yet feature-complete.

Not yet ported:

- Built-in video player.
- Thumbnail generation.
- Persistent settings beyond browser localStorage processing options.
- Context menu parity with Qt version.
- Full Apple Developer ID signing and notarization.

## Qt Reference

Use the Qt project as the source of truth for behavior:

```text
../pp18-video-tools_qt/src/MainWindow.cpp
../pp18-video-tools_qt/src/MainWindow.h
../pp18-video-tools_qt/src/services/FfmpegBatchService.cpp
../pp18-video-tools_qt/src/services/FfmpegBatchService.h
../pp18-video-tools_qt/src/services/TelegramController.cpp
../pp18-video-tools_qt/src/services/TelegramService.cpp
```

Important Qt behavior to preserve:

- User selects one or more video files.
- Only video files enter the table.
- Default table actions: `Preview` and `TG` checked, `Fixes` unchecked.
- Processing options are independent from table checkboxes.
- If `Fixes + Preview` are selected, preview is created from the fixed output.
- If `Fixes + TG` are selected and `Preview` is off, TG sends an already existing preview from the fixed output; it does not create a preview.
- If only `TG` is selected, the app sends an existing `__preview.mp4`; it does not create a preview.
- Output paths:

```text
fixed/<input-basename>.mov
<source-or-fixed-output>__preview.mp4
```

- Existing selected outputs are shown as warning/pink in the Qt table.
- Missing `__preview` for `TG` with `Preview` off is a warning status.

## Commands

Install/update JS dependencies:

```bash
pnpm install
```

If installing on an exFAT Windows drive, configure pnpm first:

```bash
pnpm config set node-linker hoisted
pnpm install
```

Copy local binaries:

```bash
pnpm sync-binaries
```

Build frontend only:

```bash
pnpm build
```

Run Tauri in dev:

```bash
pnpm tauri:dev
```

Build Tauri release bundle:

```bash
pnpm tauri:build
```

Build a local installer without updater artifacts or updater signing:

```bash
pnpm tauri:build:local
```

Known verified state:

```text
pnpm build       OK as of v0.1.6
cargo test       OK as of v0.1.6
GitHub release   OK for v0.1.6 on Windows/macOS arm64/macOS x64
```

## Dependency Notes

The Tauri packages were adjusted because the CLI rejected mismatched JS/Rust package versions.

Current working dependency state:

```text
@tauri-apps/api           2.11.0
@tauri-apps/plugin-dialog 2.7.1
@tauri-apps/plugin-process 2.3.1
@tauri-apps/plugin-updater 2.10.1
@tauri-apps/cli           2.11.1
@tailwindcss/vite         4.3.0
@radix-ui/react-dialog    1.1.15
@radix-ui/react-checkbox  1.3.3
@radix-ui/react-select    2.2.6
tailwindcss               4.3.0
class-variance-authority  0.7.1
clsx                      2.1.1
tailwind-merge            3.6.0
lucide-react              1.14.0
vite                      7.0.0
typescript                5.9.0
reqwest                   0.13.3
tauri                    2.11.1
tauri-build              2.6.1
tauri-plugin-dialog      2.7.1
tauri-plugin-updater     2.10.1
tauri-plugin-process     2.3.1
```

If Tauri reports version mismatch again, align the JS package minor versions with the Rust crates shown in the error.

## Binaries

The project has copied binaries in:

```text
src-tauri/bin
```

Current copied files:

```text
ffmpeg
ffprobe
ffmpeg.exe
ffprobe.exe
```

These files are ignored locally and are not stored in Git. The release workflow
downloads platform binaries into `src-tauri/bin` before running the Tauri build.
macOS release jobs must download architecture-specific FFmpeg/FFprobe binaries:
`arm64` for `aarch64-apple-darwin` and `amd64` for `x86_64-apple-darwin`.
HandBrakeCLI is not used by the Tauri workflow; both fixes and preview encoding use `ffmpeg`.
Local `HandBrakeCLI*` copies were removed because they are not part of the
current processing path.

## Release and Updates

The updater public key is configured in `src-tauri/tauri.conf.json`.
The private signing key was generated locally at:

```text
~/.tauri/pp18-video-tools.key
```

Add the private key content to GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`.
The current generated key has no password, so the release workflow does not pass
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

macOS bundles use ad-hoc signing through `bundle.macOS.signingIdentity: "-"`.
This creates a valid app resource seal and avoids broken-bundle Gatekeeper
errors. Fully trusted first-run behavior requires Developer ID signing and
Apple notarization secrets.

Release workflow trigger:

```bash
git tag v0.1.9
git push origin main v0.1.9
```

Version must be bumped consistently in:

```text
package.json
src-tauri/Cargo.toml
src-tauri/Cargo.lock
src-tauri/tauri.conf.json
```

The release workflow creates GitHub Release assets and `latest.json`. The app
checks for updates automatically on startup only in production builds. The
updater endpoint is:

```text
https://github.com/ayurash77/pp18-video-tools_tauri/releases/latest/download/latest.json
```

Latest release at handoff time:

```text
v0.1.9
https://github.com/ayurash77/pp18-video-tools_tauri/releases/tag/v0.1.9
```

Assets in `v0.1.6` include:

```text
latest.json
PP18.Video.Tools_0.1.6_aarch64.dmg
PP18.Video.Tools_0.1.6_x64.dmg
PP18.Video.Tools_0.1.6_x64-setup.exe
PP18.Video.Tools_0.1.6_x64-setup.exe.sig
PP18.Video.Tools_0.1.6_x64_en-US.msi
PP18.Video.Tools_0.1.6_x64_en-US.msi.sig
PP18.Video.Tools_aarch64.app.tar.gz
PP18.Video.Tools_aarch64.app.tar.gz.sig
PP18.Video.Tools_x64.app.tar.gz
PP18.Video.Tools_x64.app.tar.gz.sig
```

## Recent Fixes and Context

- Tauri package versions were aligned to remove updater bundle type warnings.
- Telegram caption path mapping was fixed for Windows so drive-letter paths do
  not become duplicated, for example `w:\W:\...`.
- Log order was changed so newest messages are at the bottom with auto-scroll.
- Startup session logs should be fresh for the current run, not restored from a
  previous session.
- App layout was adjusted so the whole application does not scroll; table/logs
  own their scrolling areas.
- Long paths and row action buttons were compacted in the table.
- Focus styling for selects and checkboxes was refined to match the Shotmate
  reference more closely.
- App icon generation and Windows `.ico` bundling were fixed earlier.
- `v0.1.6` fixed Windows shell launching and release compilation.

## User Preferences

- Communicate in Russian.
- Use `pnpm`, not npm/yarn.
- Prefer continuing implementation over only proposing plans.
- Design should move toward the reference project:

```text
/Users/ayurash/Development/_Projects/shotmate-monorepo/apps/web
```

- The reference uses many custom shadcn-based controls. The Tauri app is moving
  in that direction with local Radix/shadcn-like components rather than relying
  on inconsistent native-looking browser controls.
- Preserve the Qt behavior where it is already defined and use the Qt project as
  the behavioral source of truth.

## Suggested Next Steps

1. Continue replacing remaining native controls with local Radix/shadcn-style components.
2. Add built-in video player.
3. Add thumbnail generation.
4. Split binary bundling per platform so macOS bundles do not include `.exe` files.
5. Add Apple Developer ID signing and notarization when distribution needs trusted first-run macOS behavior.
