import { NextResponse } from 'next/server';
import { runEnrichment } from '@/lib/discover/enricher';
import { runEvaluation } from '@/lib/discover/evaluator';

export const dynamic    = 'force-dynamic';
export const maxDuration = 120;

export async function POST(): Promise<NextResponse> {
  const enrichment = await runEnrichment();
  const evaluation = await runEvaluation();
  return NextResponse.json({ enrichment, evaluation });
}
