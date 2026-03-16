/**
 * MineCtris Daily Challenge Leaderboard — Cloudflare Worker
 *
 * Routes:
 *   POST /api/scores          — validate and submit a score
 *   GET  /api/leaderboard/:date — return top 20 for a given date (YYYY-MM-DD)
 *
 * KV Structure (binding: LEADERBOARD_KV):
 *   leaderboard:YYYY-MM-DD   → JSON array of top 100 entries, sorted desc by score
 *   player:{name}:{date}     → JSON { count, ipHash } for rate limiting
 *   flagged:YYYY-MM-DD       → JSON array of flagged entries (not shown publicly)
 */

// ── Constants ────────────────────────────────────────────────────────────────

const LEADERBOARD_MAX = 100;
const TOP_N = 20;
const DISPLAY_NAME_REGEX = /^[a-zA-Z0-9_]{1,16}$/;

// Scoring upper bound per line cleared.
// Derived from game logic:
//   Max line score: 800 (4-line) × 3.0 (max combo) × 1.5 (blitz) = 3600 per 4 lines
//   Plus generous allowance for mining points (gold: 50, crystal: 35, etc.)
// 1500 per line is ~2× theoretical perfect play.
const MAX_SCORE_PER_LINE = 1500;

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

async function hashIP(ip) {
  // One-way hash of IP for rate-limit keying — never stored or logged raw.
  const data = new TextEncoder().encode(ip + ':minectris-salt');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function corsHeaders(origin, allowedOrigin) {
  const allowed = allowedOrigin || '*';
  const requestOrigin = origin || '';
  const isAllowed = allowed === '*' || requestOrigin === allowed;
  return {
    'Access-Control-Allow-Origin': isAllowed ? (allowed === '*' ? '*' : requestOrigin) : '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ── Score Submission ─────────────────────────────────────────────────────────

async function handlePostScore(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { displayName, score, linesCleared, date, clientTimestamp } = body;

  // 1. Validate display name
  if (!displayName || !DISPLAY_NAME_REGEX.test(displayName)) {
    return jsonResponse({ error: 'Invalid display name' }, 400);
  }

  // 2. Validate date — must be today's UTC date
  if (!date || !isValidDate(date) || date !== todayUTC()) {
    return jsonResponse({ error: 'Invalid or stale date' }, 400);
  }

  // 3. Validate numeric fields
  const scoreNum = parseInt(score, 10);
  const linesNum = parseInt(linesCleared, 10);
  if (!Number.isInteger(scoreNum) || scoreNum < 0 ||
      !Number.isInteger(linesNum) || linesNum < 0) {
    return jsonResponse({ error: 'Invalid score or linesCleared' }, 400);
  }

  // 4. Plausibility: score / (linesCleared + 1) must be within theoretical max
  if (scoreNum / (linesNum + 1) > MAX_SCORE_PER_LINE) {
    return jsonResponse({ error: 'Score fails plausibility check' }, 400);
  }

  // 5. Rate limit: 1 submission per displayName per day
  const playerKey = `player:${displayName.toLowerCase()}:${date}`;
  const existingEntry = await env.LEADERBOARD_KV.get(playerKey, { type: 'json' });
  if (existingEntry) {
    return jsonResponse({ error: 'Already submitted today' }, 429);
  }

  // 6. IP-based secondary rate limit (same IP, different name)
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
             '0.0.0.0';
  const ipHash = await hashIP(ip);
  const ipKey = `ip:${ipHash}:${date}`;
  const ipEntry = await env.LEADERBOARD_KV.get(ipKey, { type: 'json' });
  if (ipEntry && ipEntry.count >= 3) {
    return jsonResponse({ error: 'Too many submissions from this IP today' }, 429);
  }

  // 7. Load current leaderboard
  const lbKey = `leaderboard:${date}`;
  let leaderboard = (await env.LEADERBOARD_KV.get(lbKey, { type: 'json' })) || [];

  // 8. Statistical flagging: if score > P99 of current leaderboard
  let flagged = false;
  if (leaderboard.length >= 20) {
    const sorted = [...leaderboard].sort((a, b) => b.score - a.score);
    const p99Index = Math.floor(sorted.length * 0.01);
    const p99Score = sorted[Math.min(p99Index, sorted.length - 1)].score;
    if (scoreNum > p99Score && scoreNum > sorted[0].score * 1.1) {
      flagged = true;
    }
  }

  const entry = {
    displayName,
    score: scoreNum,
    linesCleared: linesNum,
    date,
    submittedAt: new Date().toISOString(),
  };

  if (flagged) {
    // Store flagged entry separately; still accept (don't reveal flagging)
    const flaggedKey = `flagged:${date}`;
    const flaggedList = (await env.LEADERBOARD_KV.get(flaggedKey, { type: 'json' })) || [];
    flaggedList.push({ ...entry, ipHash });
    await env.LEADERBOARD_KV.put(flaggedKey, JSON.stringify(flaggedList), {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });
  }

  // 9. Insert into leaderboard (sorted desc), truncate to top 100
  leaderboard.push(entry);
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > LEADERBOARD_MAX) {
    leaderboard = leaderboard.slice(0, LEADERBOARD_MAX);
  }

  const ttl = 60 * 60 * 24 * 7; // keep for 7 days
  await Promise.all([
    env.LEADERBOARD_KV.put(lbKey, JSON.stringify(leaderboard), { expirationTtl: ttl }),
    env.LEADERBOARD_KV.put(playerKey, JSON.stringify({ submittedAt: entry.submittedAt }), {
      expirationTtl: ttl,
    }),
    env.LEADERBOARD_KV.put(
      ipKey,
      JSON.stringify({ count: (ipEntry?.count || 0) + 1 }),
      { expirationTtl: ttl }
    ),
  ]);

  // Return the entry's rank (position in leaderboard, 1-indexed)
  const rank = leaderboard.findIndex(e => e.displayName === displayName && e.score === scoreNum) + 1;

  return jsonResponse({ ok: true, rank, total: leaderboard.length });
}

// ── Leaderboard Fetch ─────────────────────────────────────────────────────────

async function handleGetLeaderboard(date, env) {
  if (!date || !isValidDate(date)) {
    return jsonResponse({ error: 'Invalid date format. Use YYYY-MM-DD.' }, 400);
  }

  const lbKey = `leaderboard:${date}`;
  const leaderboard = (await env.LEADERBOARD_KV.get(lbKey, { type: 'json' })) || [];
  const top20 = leaderboard.slice(0, TOP_N).map((entry, i) => ({
    rank: i + 1,
    displayName: entry.displayName,
    score: entry.score,
    linesCleared: entry.linesCleared,
  }));

  return jsonResponse({ date, entries: top20, total: leaderboard.length });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const cors = corsHeaders(request.headers.get('Origin'), env.ALLOWED_ORIGIN);

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    let response;

    if (method === 'POST' && url.pathname === '/api/scores') {
      response = await handlePostScore(request, env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/leaderboard/')) {
      const date = url.pathname.replace('/api/leaderboard/', '');
      response = await handleGetLeaderboard(date, env);
    } else {
      response = jsonResponse({ error: 'Not found' }, 404);
    }

    // Attach CORS headers to every response
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(cors)) {
      if (v) headers.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
};
