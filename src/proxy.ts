import { NextRequest, NextResponse } from 'next/server';

// ----------------------------------------------------------------
// Fair Judge — Route Protection
//
// Cron trigger routes:
//   Protected by CRON_SECRET env var.
//   Vercel sends: Authorization: Bearer {CRON_SECRET} automatically
//   when CRON_SECRET is set in the Vercel project.
//   If CRON_SECRET is unset (local dev), routes are open.
//
// Admin routes (page + sensitive API):
//   Protected by ADMIN_SECRET env var.
//   Page:    HTTP Basic Auth → browser shows native dialog.
//            On success, sets an httpOnly session cookie so the
//            PromoteButton client component can call /api/discover/promote
//            without embedding the secret.
//   API:     Accepts either Bearer token or the session cookie.
//   If ADMIN_SECRET is unset (local dev), routes are open.
// ----------------------------------------------------------------

const CRON_ROUTES = new Set([
  '/api/discover/trigger',
  '/api/discover/enrich/trigger',
  '/api/discover/age-topics/trigger',
  '/api/discover/evaluate/trigger',
]);

const ADMIN_API_ROUTES = new Set([
  '/api/discover/candidates',
  '/api/discover/promote',
]);

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

function getBasicPassword(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
    // Accepts "admin:{password}" or ":{password}" (any username)
    const colon = decoded.indexOf(':');
    return colon >= 0 ? decoded.slice(colon + 1) : decoded;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // ── Cron trigger routes ───────────────────────────────────────
  if (CRON_ROUTES.has(pathname)) {
    const secret = process.env.CRON_SECRET;
    if (secret && getBearerToken(req) !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── Admin page routes ─────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return NextResponse.next();  // local dev: open

    const token   = getBasicPassword(req) ?? getBearerToken(req);
    const cookie  = req.cookies.get('admin-session')?.value;

    if (token !== secret && cookie !== secret) {
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Fair Judge Admin"' },
      });
    }

    // Auth succeeded — set session cookie so PromoteButton API calls work
    const res = NextResponse.next();
    res.cookies.set('admin-session', secret, {
      httpOnly:  true,
      secure:    process.env.NODE_ENV === 'production',
      sameSite:  'strict',
      maxAge:    3600,
      path:      '/',
    });
    return res;
  }

  // ── Admin API routes ──────────────────────────────────────────
  if (ADMIN_API_ROUTES.has(pathname)) {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return NextResponse.next();  // local dev: open

    const token  = getBearerToken(req);
    const cookie = req.cookies.get('admin-session')?.value;

    if (token !== secret && cookie !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/discover/trigger',
    '/api/discover/enrich/trigger',
    '/api/discover/age-topics/trigger',
    '/api/discover/evaluate/trigger',
    '/api/discover/candidates',
    '/api/discover/promote',
  ],
};
