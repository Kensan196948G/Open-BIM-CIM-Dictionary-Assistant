import type { ReactNode } from "react";

export type BadgeProps = {
  children: ReactNode;
};

/** Text-first category/metadata chip — meaning is carried by the text, never色only. */
export function Badge({ children }: BadgeProps) {
  return (
    <span className="inline-block rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
      {children}
    </span>
  );
}
