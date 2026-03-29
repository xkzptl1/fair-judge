import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Derive base URL from incoming request so this works in any environment
  const { origin } = new URL(req.url);

  let data: unknown = null;
  let ok = false;

  try {
    const res = await fetch(`${origin}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    ok = res.ok;
    data = await res.json();
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: ok, result: data }, { status: ok ? 200 : 502 });
}
