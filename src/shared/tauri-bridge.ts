import { invoke } from "@tauri-apps/api/core";

export async function checkOpenClawInstalled(): Promise<{
  installed: boolean;
  version: string | null;
}> {
  return invoke("check_openclaw_installed");
}

export async function startSidecar(): Promise<void> {
  return invoke("start_sidecar");
}

export async function getSidecarLogs(): Promise<string> {
  return invoke("get_sidecar_logs");
}

export async function greet(name: string): Promise<string> {
  return invoke("greet", { name });
}
