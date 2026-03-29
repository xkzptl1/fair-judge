import Link from "next/link";
import type { TopicSummary } from "@/types/topic";
import { StanceBar } from "./StanceBar";

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  return `${days}日前`;
}

function computeBadges(topic: TopicSummary): string[] {
  const { stanceDistribution: d, hasFactCheck, overseasRatio, firstSeenAt } = topic;
  const total = (Object.values(d) as number[]).reduce((s, n) => s + n, 0);
  const conflictRatio = total > 0 ? (d.support + d.challenge) / total : 0;

  const signals: string[] = [];

  if (hasFactCheck) signals.push("✓ ファクトチェックあり");
  if (d.support > 0 && d.challenge > 0 && conflictRatio >= 0.6) signals.push("⚡ 意見が対立");
  if (overseasRatio > 0.5) signals.push("🌐 海外で議論中");
  if (Date.now() - new Date(firstSeenAt).getTime() < 48 * 3_600_000) signals.push("🆕 新着");

  return signals.slice(0, 2);
}

interface Props {
  topic: TopicSummary;
}

export function TopicCard({ topic }: Props) {
  const badges = computeBadges(topic);

  return (
    <Link href={`/topic/${topic.id}`} className="block">
      <article className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition-colors hover:border-slate-600 hover:bg-slate-800/60">
        {/* Title */}
        <h2 className="mb-3 text-base font-semibold leading-snug text-slate-100">
          {topic.title}
        </h2>

        {/* Summary */}
        {topic.summary && (
          <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-slate-400">
            {topic.summary}
          </p>
        )}

        {/* Discovery badges */}
        {badges.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {/* Stance distribution */}
        <StanceBar distribution={topic.stanceDistribution} />

        {/* Meta */}
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 overflow-hidden">
          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-slate-500 whitespace-nowrap">
            {topic.category}
          </span>
          <span className="shrink-0 whitespace-nowrap">記事 {topic.articleCount}件</span>
          <span className="shrink-0 whitespace-nowrap">メディア {topic.sourceCount}社</span>
          <span className="ml-auto shrink-0 flex items-center gap-1 whitespace-nowrap">
            <span className="text-slate-600">初出 {formatRelativeDate(topic.firstSeenAt)}</span>
            <span className="text-slate-700">·</span>
            <span>{formatRelativeDate(topic.lastUpdatedAt)}</span>
          </span>
        </div>
      </article>
    </Link>
  );
}
