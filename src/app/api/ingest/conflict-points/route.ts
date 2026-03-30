import { NextRequest, NextResponse } from 'next/server';
import { batchUpdateConflictPoints, updateConflictPoints } from '@/lib/ingest/conflict-points';

// POST /api/ingest/conflict-points
//   body: {}                    → batch (all active topics missing conflict_points)
//   body: { topicId, force }    → single topic
//   ?force=true                 → regenerate even if already set
export async function POST(req: NextRequest): Promise<NextResponse> {
  const force = new URL(req.url).searchParams.get('force') === 'true';

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const topicId = typeof body.topicId === 'string' ? body.topicId : null;

  if (topicId) {
    const result = await updateConflictPoints(topicId, { force });
    return NextResponse.json({ topicId, ...result });
  }

  const result = await batchUpdateConflictPoints({ force });
  return NextResponse.json(result);
}
