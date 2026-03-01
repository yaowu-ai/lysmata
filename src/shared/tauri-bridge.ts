import { invoke } from "@tauri-apps/api/core";

export async function startSidecar(): Promise<void> {
  return invoke("start_sidecar");
}

export async function greet(name: string): Promise<string> {
  return invoke("greet", { name });
}
