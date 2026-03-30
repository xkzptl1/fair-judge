export type Stance = "support" | "challenge" | "report_only" | "mixed" | "unclear";

export interface StanceDistribution {
  support: number;
  challenge: number;
  report_only: number;
  mixed: number;
  unclear: number;
}

export const CATEGORY_ORDER = [
  'AI・テック', '政治', '経済', '社会',
  '国際', '健康・医療', '環境', 'その他',
] as const;

export type Category = typeof CATEGORY_ORDER[number];

export interface TopicSummary {
  id: string;
  title: string;
  summary: string | null;
  articleCount: number;
  sourceCount: number;
  lastUpdatedAt: string;
  firstSeenAt: string;
  stanceDistribution: StanceDistribution;
  hasFactCheck: boolean;
  category: string;
  overseasRatio: number;
  conflictPoints: string[];
}

export interface ArticleWithClassification {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  sourceDomain: string;
  sourceDisplayName: string | null;
  stance: Stance;
  reason: string | null;
  confidence: number | null;
}

export interface FactCheck {
  id: string;
  claim: string;
  verdict: string | null;
  explanation: string | null;
  sourceUrl: string | null;
  factChecker: string | null;
}

export interface TopicDetail {
  id: string;
  title: string;
  summary: string | null;
  mainIssues: string[];
  conflictPoints: string[];
  causalStructure: string | null;
  japanImpact: string[] | null;
  articleCount: number;
  sourceCount: number;
  lastUpdatedAt: string;
  stanceDistribution: StanceDistribution;
  articles: ArticleWithClassification[];
  factChecks: FactCheck[];
}
