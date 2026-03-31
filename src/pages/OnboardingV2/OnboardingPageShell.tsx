import type { ReactNode } from "react";
import { cn } from "../../shared/lib/utils";
import { StandardFooter } from "./StandardFooter";

type FooterProps = Parameters<typeof StandardFooter>[0];

interface OnboardingPageShellProps {
  children: ReactNode;
  footer: FooterProps;
  mainClassName?: string;
  contentClassName?: string;
}

export function OnboardingPageShell({
  children,
  footer,
  mainClassName,
  contentClassName,
}: OnboardingPageShellProps) {
  return (
    <>
      <main className={cn("flex flex-1 overflow-y-auto p-7", mainClassName)}>
        <div className={cn("w-full", contentClassName)}>{children}</div>
      </main>
      <StandardFooter {...footer} />
    </>
  );
}