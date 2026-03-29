import type { FactCheck } from "@/types/topic";

interface Props {
  factChecks: FactCheck[];
}

export function FactCheckSection({ factChecks }: Props) {
  if (factChecks.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        ファクトチェック
      </h2>
      <p className="mb-3 mt-0.5 text-xs text-slate-600">この話題で検証されている主張</p>
      <ul className="space-y-3">
        {factChecks.map((fc) => (
          <li key={fc.id} className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
            <p className="text-sm font-medium text-slate-200">{fc.claim}</p>

            {fc.verdict && (
              <p className="mt-1 text-sm font-semibold text-amber-400">{fc.verdict}</p>
            )}

            {fc.explanation && (
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{fc.explanation}</p>
            )}

            <div className="mt-2 flex items-center gap-3">
              {fc.factChecker && (
                <span className="text-xs text-slate-500">{fc.factChecker}</span>
              )}
              {fc.sourceUrl && (
                <a
                  href={fc.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-500 underline hover:text-slate-300"
                >
                  詳細を見る →
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
