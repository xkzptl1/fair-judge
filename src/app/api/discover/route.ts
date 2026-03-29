import { NextResponse } from 'next/server';
import { runDiscovery } from '@/lib/discover/pipeline';

export const dynamic    = 'force-dynamic';
export const maxDuration = 120;

export async function POST(): Promise<NextResponse> {
  const result = await runDiscovery();
  return NextResponse.json(result);
}
