"use client";

import { useState } from "react";
import type { Stance, ArticleWithClassification } from "@/types/topic";
import { ArticleCard } from "./ArticleCard";

const STANCE_ORDER: { key: Stance; label: string }[] = [
  { key: "support",     label: "肯定的" },
  { key: "challenge",   label: "懐疑的" },
  { key: "report_only", label: "中立" },
  { key: "mixed",       label: "両論あり" },
  { key: "unclear",     label: "判断困難" },
];

interface Props {
  articlesByStance: Partial<Record<Stance, ArticleWithClassification[]>>;
  defaultStance: Stance;
}

export function StanceTabs({ articlesByStance, defaultStance }: Props) {
  const [active, setActive] = useState<Stance>(defaultStance);

  const availableTabs = STANCE_ORDER.filter(
    ({ key }) => (articlesByStance[key]?.length ?? 0) > 0
  );

  // Fallback if defaultStance has no articles
  const activeStance = (articlesByStance[active]?.length ?? 0) > 0
    ? active
    : availableTabs[0]?.key ?? "support";

  const articles = articlesByStance[activeStance] ?? [];

  return (
    <div>
      {/* Tab row */}
      <div className="flex gap-2 overflow-x-auto border-b border-slate-800 pb-3">
        {availableTabs.map(({ key, label }) => {
          const count = articlesByStance[key]?.length ?? 0;
          const isActive = key === activeStance;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm transition-colors ${
                isActive
                  ? "bg-slate-100 font-medium text-slate-900"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {label}
              <span className={`ml-1 text-xs ${isActive ? "text-slate-500" : "text-slate-600"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Article list */}
      <ul className="mt-4 space-y-4">
        {articles.map((article) => (
          <li key={article.id}>
            <ArticleCard article={article} />
          </li>
        ))}
      </ul>
    </div>
  );
}
