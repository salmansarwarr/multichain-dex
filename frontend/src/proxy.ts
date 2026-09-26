import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Best-effort bot protection at the app edge: rejects scripted HTTP clients
// and scrapers by User-Agent, and rate-limits page requests per IP. Both
// checks are trivially bypassable by a determined attacker (UA is spoofable,
// the counter below is per server instance), so this is a first filter, not
// a substitute for Cloudflare Bot Fight Mode / Turnstile in front of the site.

const BLOCKED_UA =
  /curl|wget|python-requests|python-urllib|aiohttp|httpx|scrapy|go-http-client|okhttp|java\/|libwww|node-fetch|axios|undici|headlesschrome|phantomjs|puppeteer|playwright|selenium|httrack|masscan|nikto|sqlmap|nmap|zgrab|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider/i;

// Real browsers fetch a page once plus a few navigations; well above that
// is a scraper. Counted per IP over a fixed window.
const RATE_LIMIT = 60;
const WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 10_000;

const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function isRateLimited(ip: string, now: number): boolean {
  // Bound memory: drop expired entries once the table gets large.
  if (hits.size > MAX_TRACKED_IPS) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
    if (hits.size > MAX_TRACKED_IPS) hits.clear();
  }

  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export function proxy(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') ?? '';

  if (!userAgent || BLOCKED_UA.test(userAgent)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (isRateLimited(clientIp(request), Date.now())) {
    return new NextResponse('Too many requests', {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets so a normal page load's many asset requests don't
  // count against the limit; robots.txt stays reachable for crawlers.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|mp4|ico)$).*)'],
};
