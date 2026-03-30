import Link from "next/link";
import { notFound } from "next/navigation";
import { getTopicDetail } from "@/lib/queries";
import { StanceBar } from "@/components/StanceBar";
import { StanceTabs } from "@/components/StanceTabs";
import { FactCheckSection } from "@/components/FactCheckSection";
import type { Stance } from "@/types/topic";

export const revalidate = 60;

const STANCE_ORDER: Stance[] = ["support", "challenge", "report_only", "mixed", "unclear"];

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const topic = await getTopicDetail(id);
  if (!topic) notFound();

  // Group articles by stance, preserving confidence order (already sorted in query)
  const articlesByStance = Object.fromEntries(
    STANCE_ORDER.map((stance) => [
      stance,
      topic.articles.filter((a) => a.stance === stance),
    ])
  ) as Record<Stance, typeof topic.articles>;

  // Default tab: stance with the most articles
  const defaultStance = STANCE_ORDER.reduce((best, stance) =>
    articlesByStance[stance].length > articlesByStance[best].length ? stance : best
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
      >
        ← トピック一覧に戻る
      </Link>

      {/* Title */}
      <h1 className="mt-3 text-xl font-bold leading-snug text-slate-100">{topic.title}</h1>

      {/* Summary */}
      {topic.summary && (
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{topic.summary}</p>
      )}

      {/* Conflict points — primary value layer (Phase 2 Evolution) */}
      <section className="mt-5 rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3">
        <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          解釈が分かれているポイント
        </h2>
        {topic.conflictPoints.length > 0 ? (
          <ul className="space-y-2">
            {topic.conflictPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug text-slate-200">
                <span className="mt-0.5 shrink-0 text-rose-500/70">⚡</span>
                {point}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">分析中...</p>
        )}
      </section>

      {/* Stance distribution */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs text-slate-500">報道の傾向</p>
        <StanceBar distribution={topic.stanceDistribution} />
      </div>

      {/* Main issues (legacy field — shown only if conflict_points not yet generated) */}
      {topic.conflictPoints.length === 0 && topic.mainIssues.length > 0 && (
        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            この話題の争点
          </h2>
          <ul className="space-y-1.5">
            {topic.mainIssues.map((issue, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug text-slate-300">
                <span className="mt-0.5 shrink-0 text-slate-600">•</span>
                {issue}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Divider */}
      <hr className="my-6 border-slate-800" />

      {/* Fact check — only shown if data exists, never mixed with stances */}
      {topic.factChecks.length > 0 && (
        <>
          <FactCheckSection factChecks={topic.factChecks} />
          <hr className="my-6 border-slate-800" />
        </>
      )}

      {/* Articles grouped by stance */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          各メディアの論調
        </h2>
        <StanceTabs articlesByStance={articlesByStance} defaultStance={defaultStance} />
      </section>
    </main>
  );
}
