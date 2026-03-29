import type { Stance } from '@/types/topic';

// ----------------------------------------------------------------
// Lightweight heuristic stance classifier
// Uses keyword counting on title + summary.
// Language-agnostic: works on Japanese and English text.
// Replace with LLM classification in Phase 7.
// ----------------------------------------------------------------

const SUPPORT_KEYWORDS = [
  // Japanese
  '歓迎', '評価', '成功', '効果', '改善', '前進', '合意', '支持', '推進', '実現',
  '前向き', '肯定', '促進', '期待', '達成', '好調', '増加', '上昇', '拡大',
  // English
  'welcome', 'progress', 'success', 'successful', 'effective', 'approve', 'approval',
  'achieve', 'achievement', 'benefit', 'boost', 'agree', 'agreement', 'advance',
  'improve', 'improvement', 'positive', 'gain', 'recover', 'recovery', 'resolve',
];

const CHALLENGE_KEYWORDS = [
  // Japanese
  '批判', '反対', '懸念', '問題', '失敗', '悪化', '抗議', '警告', 'リスク',
  '反発', '否定', '不満', '危機', '崩壊', '不足', '欠陥', '遅延', '困難',
  '撤回', '拒否', '非難', '疑問', '矛盾',
  // English
  'criticize', 'criticism', 'concern', 'oppose', 'opposition', 'failure', 'fail',
  'reject', 'rejection', 'protest', 'warn', 'warning', 'crisis', 'collapse',
  'shortage', 'threat', 'threaten', 'dispute', 'conflict', 'condemn', 'condemns',
  'denounce', 'controversy', 'famine', 'blackout', 'outage', 'struggle',
];

const MIXED_KEYWORDS = [
  // Japanese
  '賛否', '両論', '対立', '議論が割れ', '賛成と反対', '意見が分かれ', '論争',
  // English
  'debate', 'controversial', 'divided', 'mixed reaction', 'split opinion',
  'both sides', 'pros and cons',
];

function countMatches(text: string, keywords: string[]): number {
  let count = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) count++;
  }
  return count;
}

export function classifyArticle(
  title: string,
  summary: string | null
): { stance: Stance; confidence: number } {
  const text = `${title} ${summary ?? ''}`.toLowerCase();

  const mixedCount = countMatches(text, MIXED_KEYWORDS);
  const supportCount = countMatches(text, SUPPORT_KEYWORDS);
  const challengeCount = countMatches(text, CHALLENGE_KEYWORDS);

  // Explicit mixed signals
  if (mixedCount > 0) {
    return { stance: 'mixed', confidence: 0.65 };
  }

  // Both sides present
  if (supportCount > 0 && challengeCount > 0) {
    return { stance: 'mixed', confidence: 0.6 };
  }

  // Clear challenge
  if (challengeCount > 0 && challengeCount >= supportCount) {
    const confidence = Math.min(0.55 + challengeCount * 0.05, 0.82);
    return { stance: 'challenge', confidence };
  }

  // Clear support
  if (supportCount > 0) {
    const confidence = Math.min(0.55 + supportCount * 0.05, 0.80);
    return { stance: 'support', confidence };
  }

  // No clear signal — neutral reporting
  return { stance: 'report_only', confidence: 0.45 };
}
