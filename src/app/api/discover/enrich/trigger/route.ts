import { NextRequest, NextResponse } from 'next/server';

export const dynamic    = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { origin } = new URL(req.url);
  try {
    const res  = await fetch(`${origin}/api/discover/enrich`, { method: 'POST' });
    const data = await res.json();
    return NextResponse.json({ success: res.ok, result: data }, { status: res.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
