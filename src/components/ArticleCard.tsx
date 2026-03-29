import type { ArticleWithClassification } from "@/types/topic";

interface Props {
  article: ArticleWithClassification;
}

export function ArticleCard({ article }: Props) {
  const sourceName = article.sourceDisplayName ?? article.sourceDomain;

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      {/* Source */}
      <p className="mb-1.5 text-xs font-medium text-slate-400">{sourceName}</p>

      {/* Headline */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-semibold leading-snug text-slate-100 active:text-slate-300"
      >
        {article.title}
        <span className="ml-1 text-slate-500">→</span>
      </a>

      {/* Summary */}
      {article.summary && (
        <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{article.summary}</p>
      )}

      {/* Classification reason */}
      {article.reason && (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <p className="text-xs leading-relaxed text-slate-500">
            <span className="font-medium text-slate-400">分類の根拠：</span>
            {article.reason}
          </p>
        </div>
      )}
    </article>
  );
}
