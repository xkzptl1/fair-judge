import { NextRequest, NextResponse } from 'next/server';
import { ingestDiscoveredTopic } from '@/lib/ingest/discovered';

export const dynamic    = 'force-dynamic';
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing topic id' }, { status: 400 });
  }

  const result = await ingestDiscoveredTopic(id);

  const status = result.errors.length > 0 && result.added === 0 ? 500 : 200;
  return NextResponse.json(result, { status });
}
