export type UserShellKind = "posix" | "powershell" | "cmd";


export interface UserShell {
  executable: string;
  kind: UserShellKind;
}

/**
 * Platform-specific shell strategy interface.
 * Each platform implements this once; callers never branch on OS.
 */
export interface IStrategy {
  /** Resolve the user's default shell (executable + kind). */
  resolveUserShell(): UserShell;
}
