import { basename } from "node:path";
import type { UserShell, UserShellKind } from "../openclaw-bin";
import type { IStrategy } from "./types";

function classifyShell(executable: string): UserShell {
  const name = basename(executable).toLowerCase();
  if (name.includes("pwsh") || name.includes("powershell")) {
    return { executable, kind: "powershell" as UserShellKind };
  }
  if (name === "cmd" || name === "cmd.exe") {
    return { executable, kind: "cmd" as UserShellKind };
  }
  return { executable, kind: "posix" as UserShellKind };
}

export class WindowsStrategy implements IStrategy {
  resolveUserShell(): UserShell {
    return classifyShell(process.env.COMSPEC?.trim() || "cmd.exe");
  }
}
