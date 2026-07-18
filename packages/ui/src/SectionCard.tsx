import type { ReactNode } from "react";
import { useId } from "react";

export type SectionCardProps = {
  /** Section heading text (icon prefix welcome, e.g. "📊 システム情報"). */
  title: string;
  children: ReactNode;
};

/** White panel with an accessible heading — the standard content section. */
export function SectionCard({ title, children }: SectionCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 id={headingId} className="font-semibold text-slate-800">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
