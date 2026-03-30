import { NextResponse } from 'next/server';
import { batchUpdateConflictPoints } from '@/lib/ingest/conflict-points';

// GET /api/ingest/conflict-points/trigger
// Called by Vercel cron — no request body.
export async function GET(): Promise<NextResponse> {
  const result = await batchUpdateConflictPoints({ maxTopics: 10 });
  console.log('[cron] conflict-points batch:', result);
  return NextResponse.json(result);
}
