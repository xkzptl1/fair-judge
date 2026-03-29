import type { StanceDistribution } from "@/types/topic";

const STANCE_CONFIG = [
  { key: "support",     label: "肯定的",   color: "bg-emerald-500" },
  { key: "challenge",   label: "懐疑的",   color: "bg-rose-500" },
  { key: "report_only", label: "中立",     color: "bg-sky-400" },
  { key: "mixed",       label: "両論あり", color: "bg-amber-400" },
  { key: "unclear",     label: "判断困難", color: "bg-slate-500" },
] as const;

interface Props {
  distribution: StanceDistribution;
}

export function StanceBar({ distribution }: Props) {
  const total = Object.values(distribution).reduce((s, n) => s + n, 0);
  if (total === 0) {
    return (
      <p className="text-xs text-slate-500">データ収集中...</p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Visual bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
        {STANCE_CONFIG.map(({ key, color }) => {
          const count = distribution[key];
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={key}
              className={`${color} h-full`}
              style={{ width: `${pct}%` }}
              title={`${key}: ${count}`}
            />
          );
        })}
      </div>

      {/* Counts */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {STANCE_CONFIG.map(({ key, label, color }) => {
          const count = distribution[key];
          if (count === 0) return null;
          return (
            <span key={key} className="flex items-center gap-1 text-xs text-slate-400">
              <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
              {label} {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}
