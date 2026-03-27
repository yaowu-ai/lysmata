import { basename } from "node:path";
import type { IStrategy, UserShell, UserShellKind } from "./types";

function classifyShell(executable: string): UserShell {
  const name = basename(executable).toLowerCase();
  if (name.includes("pwsh") || name.includes("powershell")) {
    return { executable, kind: "powershell" as UserShellKind };
  }
  return { executable, kind: "posix" as UserShellKind };
}

export class MacStrategy implements IStrategy {
  resolveUserShell(): UserShell {
    return classifyShell(process.env.SHELL?.trim() || "/bin/sh");
  }
}
