/// <reference types="bun-types" />
import { build } from 'bun'
import { chmod } from 'node:fs/promises'

function resolveTauriTargetTriple() {
  const key = `${process.platform}-${process.arch}`
  const map: Record<string, string> = {
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'linux-arm64': 'aarch64-unknown-linux-gnu',
    'win32-x64': 'x86_64-pc-windows-msvc',
    'win32-arm64': 'aarch64-pc-windows-msvc',
  }

  const triple = map[key]
  if (!triple) {
    throw new Error(`Unsupported platform/arch: ${key}`)
  }
  return triple
}

const triple = resolveTauriTargetTriple()
const windows = triple.includes('windows')

const result = await build({
  entrypoints: ['./src-api/src/index.ts'],
  outdir: './src-tauri/bin',
  naming: `hono-sidecar-${triple}`,
  target: 'bun',
  minify: true,
})

if (!result.success || result.outputs.length === 0) {
  throw new Error('Failed to build sidecar binary')
}

if (!windows) {
  for (const output of result.outputs) {
    await chmod(output.path, 0o755)
  }
}