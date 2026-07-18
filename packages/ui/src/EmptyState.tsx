export type EmptyStateProps = {
  /** What happened, e.g. 「◯◯」に一致する用語が見つかりませんでした。 */
  title: string;
  /** Recovery hint for the user. */
  hint?: string;
};

/** Zero-result / empty guidance panel (FR-010: never a blank page). */
export function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <div role="status" className="rounded border border-slate-200 bg-white p-4">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-600">{hint}</p>}
    </div>
  );
}
