import type { ReactNode } from "react";

/** Text-first status/category chip — never色only (icon/text carry the meaning). */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
      {children}
    </span>
  );
}
