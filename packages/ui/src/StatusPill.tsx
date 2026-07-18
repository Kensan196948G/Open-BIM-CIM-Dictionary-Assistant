import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "error" | "neutral";

export type StatusPillProps = {
  tone: StatusTone;
  children: ReactNode;
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-green-100 text-green-800 border-green-300",
  warning: "bg-amber-100 text-amber-900 border-amber-300",
  error: "bg-red-100 text-red-800 border-red-300",
  neutral: "bg-slate-100 text-slate-700 border-slate-300",
};

/** State chip with color + text (色だけに依存しない状態表現, WCAG friendly). */
export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-xs ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
