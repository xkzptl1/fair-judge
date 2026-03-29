import { NextRequest, NextResponse } from 'next/server';
import { runAging } from '@/lib/discover/ager';
import { runEvaluation } from '@/lib/discover/evaluator';
import { runAutoPromotion } from '@/lib/discover/auto-promoter';

export const dynamic     = 'force-dynamic';
export const maxDuration = 120;  // increased: ingest runs inside auto-promotion

// ----------------------------------------------------------------
// POST /api/discover/age-topics
//
// Full pipeline tail — runs in sequence:
//   1. runAging()          deactivate stale topics (clears dedup context)
//   2. runEvaluation()     re-evaluate all pending candidates
//   3. runAutoPromotion()  promote ≤1 high-confidence candidate
//
// The sequence is load-bearing:
//   - Aging must precede evaluation so deactivated topics are absent
//     from the dedup context when candidates are re-assessed.
//   - Evaluation must precede auto-promotion so newly-unblocked
//     candidates have their status updated to ready_for_promotion
//     before auto-promotion looks for them.
//
// Dry-run mode (query param ?dry_run=true):
//   Aging and evaluation run normally. Auto-promotion identifies the
//   eligible candidate but does not insert into topics or update
//   candidate status. Safe to run at any time for inspection.
// ----------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url    = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';

  const aging      = await runAging();
  const evaluation = await runEvaluation();
  const autoPromo  = await runAutoPromotion({ dryRun });

  return NextResponse.json({ aging, evaluation, autoPromo });
}
