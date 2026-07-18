import { Badge } from "./Badge";

export type ResultCardProps = {
  /** Primary name (e.g. IfcAlignment). */
  name: string;
  /** Metadata chips shown next to the name (standard family, type, version, …). */
  badges?: string[];
  /** Optional one-to-two-line summary. */
  summary?: string | null;
  /** Optional "matched by" footnote, e.g. 一致理由 labels. */
  footnote?: string;
};

/**
 * Dictionary search-result card body. Link/router-agnostic: wrap it in an
 * anchor or router Link for navigation; the wrapper owns hover/focus styles.
 */
export function ResultCard({ name, badges = [], summary, footnote }: ResultCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 transition-colors group-hover:border-blue-500">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-blue-800">{name}</span>
        {badges.map((badge) => (
          <Badge key={badge}>{badge}</Badge>
        ))}
      </div>
      {summary && <p className="mt-1 line-clamp-2 text-sm text-slate-700">{summary}</p>}
      {footnote && <p className="mt-1 text-xs text-slate-500">{footnote}</p>}
    </div>
  );
}
