import { supabase } from '@/lib/supabase';
import { PromoteButton } from './PromoteButton';

export const dynamic = 'force-dynamic';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

interface GateResult {
  pass:         boolean;
  value?:       number;
  threshold?:   number;
  overlap?:     number;
  note?:        string;
  oldest_hours?: number;
}

interface HardRequirements {
  min_articles: GateResult;
  min_domains:  GateResult;
  freshness:    GateResult;
  no_duplicate: GateResult;
}

interface DecisionResult {
  decision:     string;
  rule_trigger: string;
  reason:       string;
  score:        number;
  dedup_match:  { title: string; jaccard: number } | null;
  evaluated_at: string;
}

interface PromotionSnapshot {
  refined_title?:  string;
  summary?:        string;
  main_issues?:    string[];
  category?:       string;
}

interface CandidateRow {
  id:                 string;
  title:              string;
  cluster_key:        string;
  entities:           string[];
  locales:            string[];
  domain_count:       number;
  article_count:      number;
  promotion_score:    number;
  hard_requirements:  HardRequirements;
  status:             string;
  promotion_snapshot: PromotionSnapshot | null;
  decision_result:    DecisionResult | null;
  discovered_at:      string;
  updated_at:         string;
  promoted_topic_id:  string | null;
}

// For Promoted tab — includes joined topic fields
interface PromotedCandidateRow extends CandidateRow {
  topics: {
    title:           string;
    is_active:       boolean;
    last_article_at: string | null;
    promoted_at:     string | null;
  } | null;
}

// ----------------------------------------------------------------
// Tab definitions
// ----------------------------------------------------------------

type Tab = 'pending' | 'ready' | 'rejected' | 'promoted';

const TABS: { id: Tab; label: string; statusFilter: string }[] = [
  { id: 'pending',  label: '保留中',   statusFilter: 'pending'              },
  { id: 'ready',    label: '昇格待ち', statusFilter: 'ready_for_promotion'  },
  { id: 'rejected', label: '却下済',   statusFilter: 'rejected'             },
  { id: 'promoted', label: '昇格済',   statusFilter: 'auto_promoted'        },
];

// ----------------------------------------------------------------
// Data fetchers
// ----------------------------------------------------------------

const BASE_COLS =
  'id, title, cluster_key, entities, locales, domain_count, article_count, ' +
  'promotion_score, hard_requirements, status, promotion_snapshot, ' +
  'decision_result, discovered_at, updated_at, promoted_topic_id';

async function fetchCandidates(status: string): Promise<CandidateRow[]> {
  const { data, error } = await supabase
    .from('candidate_topics')
    .select(BASE_COLS)
    .eq('status', status)
    .order('promotion_score', { ascending: false });

  if (error) {
    console.error('[admin/candidates] fetch error:', error.message);
    return [];
  }
  return (data as unknown as CandidateRow[]) ?? [];
}

async function fetchPromotedCandidates(): Promise<PromotedCandidateRow[]> {
  const { data, error } = await supabase
    .from('candidate_topics')
    .select(BASE_COLS + ', topics(title, is_active, last_article_at, promoted_at)')
    .eq('status', 'auto_promoted')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[admin/candidates] promoted fetch error:', error.message);
    return [];
  }
  return (data as unknown as PromotedCandidateRow[]) ?? [];
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function scoreColour(score: number): string {
  if (score >= 0.80) return 'bg-emerald-900/60 text-emerald-300 border-emerald-700';
  if (score >= 0.65) return 'bg-sky-900/60 text-sky-300 border-sky-700';
  return 'bg-slate-800 text-slate-400 border-slate-600';
}

function localeLabel(locale: string): string {
  const map: Record<string, string> = { ja: 'JA', 'en-US': 'EN', 'en-GB': 'GB' };
  return map[locale] ?? locale;
}

function gateIcon(pass: boolean) {
  return pass
    ? <span className="text-emerald-400">✓</span>
    : <span className="text-rose-400">✗</span>;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor(diff / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}日前`;
  if (h >= 1)  return `${h}時間前`;
  return `${m}分前`;
}

// ----------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------

function GateRow({ req }: { req: HardRequirements }) {
  const gates: [string, GateResult][] = [
    ['記事数',   req.min_articles],
    ['メディア', req.min_domains],
    ['鮮度',     req.freshness],
    ['重複なし', req.no_duplicate],
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
      {gates.map(([label, gate]) => (
        <span key={label} className="flex items-center gap-1">
          {gateIcon(gate.pass)}
          <span>{label}</span>
          {gate.value !== undefined && gate.threshold !== undefined && (
            <span className="text-slate-500">({gate.value}/{gate.threshold})</span>
          )}
          {gate.oldest_hours !== undefined && gate.threshold !== undefined && (
            <span className="text-slate-500">({gate.oldest_hours}h/{gate.threshold}h)</span>
          )}
        </span>
      ))}
    </div>
  );
}

function DecisionBadge({ result }: { result: DecisionResult | null }) {
  if (!result) return null;
  const colours: Record<string, string> = {
    hold:    'bg-amber-900/50 border-amber-700 text-amber-300',
    promote: 'bg-emerald-900/50 border-emerald-700 text-emerald-300',
    reject:  'bg-rose-900/50 border-rose-700 text-rose-300',
  };
  const cls = colours[result.decision] ?? 'bg-slate-800 border-slate-600 text-slate-400';
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-mono ${cls}`}>
      {result.rule_trigger}
    </span>
  );
}

// ----------------------------------------------------------------
// Card variants per tab
// ----------------------------------------------------------------

function PendingCard({ row }: { row: CandidateRow }) {
  const snap = row.promotion_snapshot;
  const displayTitle = snap?.refined_title ?? row.title;
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-mono font-semibold ${scoreColour(row.promotion_score)}`}>
          {row.promotion_score.toFixed(2)}
        </span>
        <DecisionBadge result={row.decision_result} />
        {snap
          ? <span className="rounded-full bg-violet-900/50 border border-violet-700 px-2.5 py-0.5 text-xs text-violet-300">エンリッチ済</span>
          : <span className="rounded-full bg-amber-900/50 border border-amber-700 px-2.5 py-0.5 text-xs text-amber-300">未エンリッチ</span>
        }
        <span className="ml-auto text-xs text-slate-500">{relativeTime(row.updated_at)}</span>
      </div>
      <h2 className="text-base font-semibold text-slate-100 leading-snug">{displayTitle}</h2>
      {row.decision_result?.reason && (
        <p className="text-xs text-slate-400 italic">{row.decision_result.reason}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        {row.locales.map((l) => (
          <span key={l} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">{localeLabel(l)}</span>
        ))}
        <span>記事 {row.article_count}本</span>
        <span>メディア {row.domain_count}社</span>
      </div>
      <GateRow req={row.hard_requirements} />
      <div className="text-xs text-slate-600 font-mono">{row.cluster_key}</div>
    </article>
  );
}

function ReadyCard({ row }: { row: CandidateRow }) {
  const snap = row.promotion_snapshot;
  const displayTitle = snap?.refined_title ?? row.title;
  return (
    <article className="rounded-xl border border-emerald-900/60 bg-slate-900 p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-mono font-semibold ${scoreColour(row.promotion_score)}`}>
          {row.promotion_score.toFixed(2)}
        </span>
        <DecisionBadge result={row.decision_result} />
        {snap?.category && (
          <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-xs text-slate-300">
            {snap.category}
          </span>
        )}
        <span className="ml-auto text-xs text-slate-500">{relativeTime(row.updated_at)}</span>
      </div>
      <h2 className="text-base font-semibold text-slate-100 leading-snug">{displayTitle}</h2>
      {snap?.summary && (
        <p className="text-sm text-slate-300 leading-relaxed">{snap.summary}</p>
      )}
      {snap?.main_issues && snap.main_issues.length > 0 && (
        <ul className="space-y-1">
          {snap.main_issues.map((issue, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-300">
              <span className="shrink-0 text-slate-600">・</span>
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        {row.locales.map((l) => (
          <span key={l} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">{localeLabel(l)}</span>
        ))}
        <span>記事 {row.article_count}本</span>
        <span>メディア {row.domain_count}社</span>
      </div>
      <GateRow req={row.hard_requirements} />
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-600 font-mono">{row.cluster_key}</span>
        <PromoteButton candidateId={row.id} title={displayTitle} />
      </div>
    </article>
  );
}

function RejectedCard({ row }: { row: CandidateRow }) {
  const snap = row.promotion_snapshot;
  const displayTitle = snap?.refined_title ?? row.title;
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3 opacity-75">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-mono font-semibold ${scoreColour(row.promotion_score)}`}>
          {row.promotion_score.toFixed(2)}
        </span>
        <DecisionBadge result={row.decision_result} />
        <span className="ml-auto text-xs text-slate-500">{relativeTime(row.updated_at)}</span>
      </div>
      <h2 className="text-base font-semibold text-slate-400 leading-snug">{displayTitle}</h2>
      {row.decision_result?.reason && (
        <p className="text-xs text-slate-500 italic">{row.decision_result.reason}</p>
      )}
      <div className="text-xs text-slate-600 font-mono">{row.cluster_key}</div>
    </article>
  );
}

function PromotedCard({ row }: { row: PromotedCandidateRow }) {
  const snap = row.promotion_snapshot;
  const displayTitle = snap?.refined_title ?? row.title;
  const topic = row.topics;
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-mono font-semibold ${scoreColour(row.promotion_score)}`}>
          {row.promotion_score.toFixed(2)}
        </span>
        {topic?.is_active
          ? <span className="rounded-full bg-emerald-900/50 border border-emerald-700 px-2.5 py-0.5 text-xs text-emerald-300">公開中</span>
          : <span className="rounded-full bg-slate-800 border border-slate-600 px-2.5 py-0.5 text-xs text-slate-400">非アクティブ</span>
        }
        <span className="ml-auto text-xs text-slate-500">{relativeTime(row.updated_at)}</span>
      </div>
      <h2 className="text-base font-semibold text-slate-100 leading-snug">{displayTitle}</h2>
      {topic && (
        <div className="rounded-md bg-slate-800/60 px-3 py-2 text-xs space-y-1">
          <div className="text-slate-400">
            <span className="text-slate-500">トピックタイトル: </span>{topic.title}
          </div>
          {topic.promoted_at && (
            <div className="text-slate-500">昇格: {relativeTime(topic.promoted_at)}</div>
          )}
          {topic.last_article_at && (
            <div className="text-slate-500">最終記事: {relativeTime(topic.last_article_at)}</div>
          )}
          {!topic.last_article_at && (
            <div className="text-slate-600 italic">記事未取得</div>
          )}
        </div>
      )}
      {!topic && (
        <p className="text-xs text-rose-400">トピックが見つかりません（削除済みの可能性）</p>
      )}
      <div className="text-xs text-slate-600 font-mono">{row.cluster_key}</div>
    </article>
  );
}

// ----------------------------------------------------------------
// Page
// ----------------------------------------------------------------

export default async function CandidatesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab = 'pending' } = await searchParams;
  const activeTab = (TABS.find((t) => t.id === rawTab)?.id ?? 'pending') as Tab;

  // Fetch data for active tab only
  let pendingRows:  CandidateRow[]         = [];
  let readyRows:    CandidateRow[]         = [];
  let rejectedRows: CandidateRow[]         = [];
  let promotedRows: PromotedCandidateRow[] = [];

  if (activeTab === 'pending')  pendingRows  = await fetchCandidates('pending');
  if (activeTab === 'ready')    readyRows    = await fetchCandidates('ready_for_promotion');
  if (activeTab === 'rejected') rejectedRows = await fetchCandidates('rejected');
  if (activeTab === 'promoted') promotedRows = await fetchPromotedCandidates();

  // Tab counts (rough — fetched per active tab only; other tabs show no count)
  const activeCount =
    activeTab === 'pending'  ? pendingRows.length  :
    activeTab === 'ready'    ? readyRows.length    :
    activeTab === 'rejected' ? rejectedRows.length :
    promotedRows.length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">

      {/* Header */}
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-100">候補トピック レビュー</h1>
        <p className="mt-1 text-sm text-slate-500">
          昇格前に各候補を確認してください。
        </p>
      </header>

      {/* Tab nav */}
      <nav className="mb-6 flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={`?tab=${t.id}`}
            className={
              'px-4 py-2 text-sm font-medium rounded-t-md transition-colors ' +
              (activeTab === t.id
                ? 'bg-slate-800 text-slate-100 border border-b-slate-800 border-slate-700 -mb-px'
                : 'text-slate-500 hover:text-slate-300')
            }
          >
            {t.label}
            {activeTab === t.id && (
              <span className="ml-2 rounded-full bg-slate-700 px-1.5 py-0.5 text-xs font-mono text-slate-300">
                {activeCount}
              </span>
            )}
          </a>
        ))}
      </nav>

      {/* Tab content */}
      {activeTab === 'pending' && (
        pendingRows.length === 0
          ? <Empty message="保留中の候補はありません。" />
          : <ul className="space-y-5">{pendingRows.map((r) => <li key={r.id}><PendingCard row={r} /></li>)}</ul>
      )}

      {activeTab === 'ready' && (
        readyRows.length === 0
          ? <Empty message="昇格待ちの候補はありません。" />
          : <ul className="space-y-5">{readyRows.map((r) => <li key={r.id}><ReadyCard row={r} /></li>)}</ul>
      )}

      {activeTab === 'rejected' && (
        rejectedRows.length === 0
          ? <Empty message="却下済みの候補はありません。" />
          : <ul className="space-y-5">{rejectedRows.map((r) => <li key={r.id}><RejectedCard row={r} /></li>)}</ul>
      )}

      {activeTab === 'promoted' && (
        promotedRows.length === 0
          ? <Empty message="昇格済みの候補はありません。" />
          : <ul className="space-y-5">{promotedRows.map((r) => <li key={r.id}><PromotedCard row={r} /></li>)}</ul>
      )}

      {/* Footer */}
      <footer className="mt-10 text-xs text-slate-600 space-y-1">
        <p>このページは内部レビュー用です。公開ホーム画面には表示されません。</p>
        <p>
          パイプライン: <code className="font-mono">/api/discover/trigger</code>
          {' → '}<code className="font-mono">/api/discover/enrich/trigger</code>
          {' → '}<code className="font-mono">/api/discover/age-topics/trigger</code>
        </p>
      </footer>
    </main>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="text-sm text-slate-500">{message}</p>;
}
