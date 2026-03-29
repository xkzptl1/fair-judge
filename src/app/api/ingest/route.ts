import { NextResponse } from 'next/server';
import { runIngest } from '@/lib/ingest/pipeline';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const results = await runIngest();

    const totalAdded = results.reduce((s, r) => s + r.articlesAdded, 0);
    const totalSkipped = results.reduce((s, r) => s + r.articlesSkipped, 0);
    const allErrors = results.flatMap((r) =>
      r.errors.map((e) => `[${r.topic}] ${e}`)
    );

    return NextResponse.json({
      ok: true,
      summary: { totalAdded, totalSkipped, topics: results.length },
      results,
      errors: allErrors,
    });
  } catch (error) {
    console.error('Ingest fatal error:', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
