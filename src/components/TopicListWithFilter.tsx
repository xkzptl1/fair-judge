"use client";

import { useState } from "react";
import type { TopicSummary } from "@/types/topic";
import { CATEGORY_ORDER } from "@/types/topic";
import { TopicCard } from "./TopicCard";

const ALL = "すべて";

interface Props {
  topics: TopicSummary[];
}

export function TopicListWithFilter({ topics }: Props) {
  const [active, setActive] = useState(ALL);

  // Only show categories that have at least one topic, in canonical order
  const presentCategories = CATEGORY_ORDER.filter((cat) =>
    topics.some((t) => t.category === cat)
  );
  const tabs = [ALL, ...presentCategories];

  const filtered = active === ALL ? topics : topics.filter((t) => t.category === active);

  return (
    <div>
      {/* Category filter strip */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`shrink-0 rounded-full px-3 py-1 text-sm transition-colors ${
              tab === active
                ? "bg-slate-100 font-medium text-slate-900"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Topic list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">該当するトピックはありません。</p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((topic) => (
            <li key={topic.id}>
              <TopicCard topic={topic} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
