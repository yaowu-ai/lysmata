import { MacShellStrategy } from "./mac-strategy";
import { WindowsShellStrategy } from "./windows-strategy";
import type { IShellStrategy } from "./types";

// Strategy is selected once at module load time — no runtime branching at call sites.
const strategy: IShellStrategy =
  process.platform === "win32" ? new WindowsShellStrategy() : new MacShellStrategy();

export const resolveUserShell = strategy.resolveUserShell.bind(strategy);
export type { IShellStrategy } from "./types";
