/// <reference types="bun-types" />
import { build } from "bun";
import { chmod } from "node:fs/promises";

const TRIPLE_TO_BUN_TARGET: Record<string, string> = {
  "x86_64-apple-darwin": "bun-darwin-x64",
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
  "aarch64-pc-windows-msvc": "bun-windows-arm64",
};

function resolveTauriTargetTriple() {
  const key = `${process.platform}-${process.arch}`;
  const map: Record<string, string> = {
    "darwin-x64": "x86_64-apple-darwin",
    "darwin-arm64": "aarch64-apple-darwin",
    "linux-x64": "x86_64-unknown-linux-gnu",
    "linux-arm64": "aarch64-unknown-linux-gnu",
    "win32-x64": "x86_64-pc-windows-msvc",
    "win32-arm64": "aarch64-pc-windows-msvc",
  };

  const triple = map[key];
  if (!triple) {
    throw new Error(`Unsupported platform/arch: ${key}`);
  }
  return triple;
}

// 支持通过环境变量指定目标架构（用于交叉编译，如 M 芯片上打 x86 包）
const triple = process.env.SIDECAR_TARGET ?? resolveTauriTargetTriple();
const bunTarget = TRIPLE_TO_BUN_TARGET[triple];
if (!bunTarget) {
  throw new Error(
    `Unsupported SIDECAR_TARGET: ${triple}. Supported: ${Object.keys(TRIPLE_TO_BUN_TARGET).join(", ")}`
  );
}

const windows = triple.includes("windows");

const result = await Bun.spawn({
  cmd: [
    "bun",
    "build",
    "--compile",
    "--minify",
    "--target",
    bunTarget,
    "./src-api/src/index.ts",
    "--outfile",
    `./src-tauri/bin/hono-sidecar${windows ? ".exe" : ""}`,
  ],
}).exited;

if (result !== 0) {
  throw new Error("Failed to build sidecar binary");
}
