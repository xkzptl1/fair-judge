import { NextResponse } from 'next/server';
import { runEvaluation } from '@/lib/discover/evaluator';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

export async function POST(): Promise<NextResponse> {
  const result = await runEvaluation();
  return NextResponse.json(result);
}
