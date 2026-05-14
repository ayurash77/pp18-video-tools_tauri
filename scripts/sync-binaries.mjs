import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const targetBin = join(projectRoot, "src-tauri", "bin");
const sourceDirs = [
  resolve(projectRoot, "..", "pp18-video-tools_qt", "bin"),
  resolve(projectRoot, "..", "pp18-video-tools_cli", "bin"),
];
const names = ["ffmpeg", "ffprobe", "ffmpeg.exe", "ffprobe.exe"];

mkdirSync(targetBin, { recursive: true });

let copied = 0;
for (const name of names) {
  const source = sourceDirs.map((dir) => join(dir, name)).find((candidate) => existsSync(candidate));
  if (!source) {
    console.log(`[skip] ${name}`);
    continue;
  }

  copyFileSync(source, join(targetBin, basename(source)));
  console.log(`[copy] ${source}`);
  copied += 1;
}

console.log(`Copied ${copied} binaries to ${targetBin}`);
