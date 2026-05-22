import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return (await file.json()) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(data, null, 2));
}
