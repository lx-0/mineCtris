/**
 * MineCtris Daily & Weekly Challenge Leaderboard — Cloudflare Worker
 *
 * Routes:
 *   POST /api/scores               — validate and submit a daily score
 *   GET  /api/leaderboard/:date    — return top 20 for a given date (YYYY-MM-DD)
 *   POST /api/scores/weekly        — validate and submit a weekly score
 *   GET  /api/leaderboard/week/:w  — return top 20 for a given ISO week (YYYY-Www)
 *
 * KV Structure (binding: LEADERBOARD_KV):
 *   leaderboard:YYYY-MM-DD        → JSON array of top 100 daily entries, sorted desc by score
 *   player:{name}:{date}          → JSON { submittedAt } for daily rate limiting
 *   flagged:YYYY-MM-DD            → JSON array of flagged daily entries
 *   leaderboard:week:YYYY-Www     → JSON array of top 100 weekly entries, sorted desc by score
 *   player:week:{name}:{weekStr}  → JSON { submittedAt } for weekly rate limiting
 *   ip:week:{hash}:{weekStr}      → JSON { count } for weekly IP rate limiting
 */

// ── Constants ────────────────────────────────────────────────────────────────

const LEADERBOARD_MAX = 100;

// ── Daily Mission Pool ───────────────────────────────────────────────────────

const MISSION_POOL = [
  // EASY (10 missions, 50 XP each)
  { id: 1, difficulty: 'easy', xp: 50, text: 'Clear 10 lines in Classic mode', metric: 'lines_cleared_classic', target: 10, condition: 'gte', accumulation: 'cumulative' },
  { id: 2, difficulty: 'easy', xp: 50, text: 'Mine 30 blocks in any mode', metric: 'blocks_mined_total', target: 30, condition: 'gte', accumulation: 'cumulative' },
  { id: 3, difficulty: 'easy', xp: 50, text: 'Play a Daily Challenge run', metric: 'daily_challenge_runs', target: 1, condition: 'gte', accumulation: 'cumulative' },
  { id: 4, difficulty: 'easy', xp: 50, text: 'Complete any Puzzle Mode level', metric: 'puzzles_completed', target: 1, condition: 'gte', accumulation: 'cumulative' },
  { id: 5, difficulty: 'easy', xp: 50, text: 'Score 3,000+ points in Blitz mode', metric: 'blitz_high_score_session', target: 3000, condition: 'gte', accumulation: 'best' },
  { id: 6, difficulty: 'easy', xp: 50, text: 'Survive 2 minutes in Classic mode', metric: 'classic_survival_seconds', target: 120, condition: 'gte', accumulation: 'best' },
  { id: 7, difficulty: 'easy', xp: 50, text: 'Complete a Sprint run', metric: 'sprint_runs_completed', target: 1, condition: 'gte', accumulation: 'cumulative' },
  { id: 8, difficulty: 'easy', xp: 50, text: 'Activate a power-up in any run', metric: 'powerups_activated_total', target: 1, condition: 'gte', accumulation: 'cumulative' },
  { id: 9, difficulty: 'easy', xp: 50, text: 'Craft any item', metric: 'items_crafted_total', target: 1, condition: 'gte', accumulation: 'cumulative' },
  { id: 10, difficulty: 'easy', xp: 50, text: 'Share your score', metric: 'score_shared', target: 1, condition: 'gte', accumulation: 'flag' },
  // MEDIUM (12 missions, 75 XP each)
  { id: 11, difficulty: 'medium', xp: 75, text: 'Clear 25 lines in Classic mode', metric: 'lines_cleared_classic', target: 25, condition: 'gte', accumulation: 'cumulative' },
  { id: 12, difficulty: 'medium', xp: 75, text: 'Finish a Sprint run in under 5 minutes', metric: 'sprint_best_time_seconds', target: 300, condition: 'lte', accumulation: 'best_lte' },
  { id: 13, difficulty: 'medium', xp: 75, text: 'Score 6,000+ points in Blitz mode', metric: 'blitz_high_score_session', target: 6000, condition: 'gte', accumulation: 'best' },
  { id: 14, difficulty: 'medium', xp: 75, text: 'Complete 2 Puzzle Mode levels', metric: 'puzzles_completed', target: 2, condition: 'gte', accumulation: 'cumulative' },
  { id: 15, difficulty: 'medium', xp: 75, text: 'Mine 75 blocks in any mode', metric: 'blocks_mined_total', target: 75, condition: 'gte', accumulation: 'cumulative' },
  { id: 16, difficulty: 'medium', xp: 75, text: 'Play a Weekly Challenge run', metric: 'weekly_challenge_runs', target: 1, condition: 'gte', accumulation: 'cumulative' },
  { id: 17, difficulty: 'medium', xp: 75, text: 'Pull off a 4-line clear in Classic mode', metric: 'tetris_clears_classic', target: 1, condition: 'gte', accumulation: 'cumulative' },
  { id: 18, difficulty: 'medium', xp: 75, text: 'Craft 3 items in any session', metric: 'items_crafted_total', target: 3, condition: 'gte', accumulation: 'cumulative' },
  { id: 19, difficulty: 'medium', xp: 75, text: 'Clear 3 lines at once in Blitz mode', metric: 'triple_clears_blitz', target: 1, condition: 'gte', accumulation: 'cumulative' },
  { id: 20, difficulty: 'medium', xp: 75, text: 'Score 4,000+ in a Daily Challenge', metric: 'daily_challenge_high_score', target: 4000, condition: 'gte', accumulation: 'best' },
  { id: 21, difficulty: 'medium', xp: 75, text: 'Activate 3 power-ups in a single run', metric: 'powerups_activated_session', target: 3, condition: 'gte', accumulation: 'best' },
  { id: 22, difficulty: 'medium', xp: 75, text: 'Survive 8 minutes in Classic mode', metric: 'classic_survival_seconds', target: 480, condition: 'gte', accumulation: 'best' },
  // HARD (8 missions, 100 XP each)
  { id: 23, difficulty: 'hard', xp: 100, text: 'Clear 50 lines in Classic mode', metric: 'lines_cleared_classic', target: 50, condition: 'gte', accumulation: 'cumulative' },
  { id: 24, difficulty: 'hard', xp: 100, text: 'Finish a Sprint run in under 3 minutes', metric: 'sprint_best_time_seconds', target: 180, condition: 'lte', accumulation: 'best_lte' },
  { id: 25, difficulty: 'hard', xp: 100, text: 'Score 10,000+ points in Blitz mode', metric: 'blitz_high_score_session', target: 10000, condition: 'gte', accumulation: 'best' },
  { id: 26, difficulty: 'hard', xp: 100, text: 'Complete 5 Puzzle Mode levels', metric: 'puzzles_completed', target: 5, condition: 'gte', accumulation: 'cumulative' },
  { id: 27, difficulty: 'hard', xp: 100, text: 'Score 5,000+ in a Weekly Challenge', metric: 'weekly_challenge_high_score', target: 5000, condition: 'gte', accumulation: 'best' },
  { id: 28, difficulty: 'hard', xp: 100, text: 'Mine 150 blocks across any modes', metric: 'blocks_mined_total', target: 150, condition: 'gte', accumulation: 'cumulative' },
  { id: 29, difficulty: 'hard', xp: 100, text: 'Score 8,000+ in a Daily Challenge', metric: 'daily_challenge_high_score', target: 8000, condition: 'gte', accumulation: 'best' },
  { id: 30, difficulty: 'hard', xp: 100, text: 'Craft 5 different item types in a single run', metric: 'unique_items_crafted_session', target: 5, condition: 'gte', accumulation: 'best' },
];

// Deterministic LCG seeded selection — must match client-side algorithm in missions.js
function _lcg(seed) {
  return ((seed * 1664525 + 1013904223) & 0xffffffff) >>> 0;
}

function _missionsForDate(dateStr) {
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) {
    seed = _lcg(seed ^ dateStr.charCodeAt(i));
  }
  const easy   = MISSION_POOL.filter(m => m.difficulty === 'easy');
  const medium = MISSION_POOL.filter(m => m.difficulty === 'medium');
  const hard   = MISSION_POOL.filter(m => m.difficulty === 'hard');
  seed = _lcg(seed); const ei = seed % easy.length;
  seed = _lcg(seed); const mi = seed % medium.length;
  seed = _lcg(seed); const hi = seed % hard.length;
  return [easy[ei], medium[mi], hard[hi]];
}

// ── Mission Handler ───────────────────────────────────────────────────────────

function handleGetMissions(dateStr) {
  if (!dateStr || !isValidDate(dateStr)) {
    return jsonResponse({ error: 'Invalid or missing date. Use YYYY-MM-DD.' }, 400);
  }
  const missions = _missionsForDate(dateStr);
  return jsonResponse({ date: dateStr, missions });
}

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

function isValidWeek(weekStr) {
  return /^\d{4}-W\d{2}$/.test(weekStr);
}

function currentISOWeek() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
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

// ── Weekly Score Submission ───────────────────────────────────────────────────

async function handlePostWeeklyScore(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { displayName, score, linesCleared, week, clientTimestamp } = body;

  // 1. Validate display name
  if (!displayName || !DISPLAY_NAME_REGEX.test(displayName)) {
    return jsonResponse({ error: 'Invalid display name' }, 400);
  }

  // 2. Validate week — must be current ISO week
  if (!week || !isValidWeek(week) || week !== currentISOWeek()) {
    return jsonResponse({ error: 'Invalid or stale week' }, 400);
  }

  // 3. Validate numeric fields
  const scoreNum = parseInt(score, 10);
  const linesNum = parseInt(linesCleared, 10);
  if (!Number.isInteger(scoreNum) || scoreNum < 0 ||
      !Number.isInteger(linesNum) || linesNum < 0) {
    return jsonResponse({ error: 'Invalid score or linesCleared' }, 400);
  }

  // 4. Plausibility check
  if (scoreNum / (linesNum + 1) > MAX_SCORE_PER_LINE) {
    return jsonResponse({ error: 'Score fails plausibility check' }, 400);
  }

  // 5. Rate limit: 1 submission per displayName per week
  const playerKey = `player:week:${displayName.toLowerCase()}:${week}`;
  const existingEntry = await env.LEADERBOARD_KV.get(playerKey, { type: 'json' });
  if (existingEntry) {
    return jsonResponse({ error: 'Already submitted this week' }, 429);
  }

  // 6. IP-based secondary rate limit (max 3 per IP per week)
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
             '0.0.0.0';
  const ipHash = await hashIP(ip);
  const ipKey = `ip:week:${ipHash}:${week}`;
  const ipEntry = await env.LEADERBOARD_KV.get(ipKey, { type: 'json' });
  if (ipEntry && ipEntry.count >= 3) {
    return jsonResponse({ error: 'Too many submissions from this IP this week' }, 429);
  }

  // 7. Load current weekly leaderboard
  const lbKey = `leaderboard:week:${week}`;
  let leaderboard = (await env.LEADERBOARD_KV.get(lbKey, { type: 'json' })) || [];

  const entry = {
    displayName,
    score: scoreNum,
    linesCleared: linesNum,
    week,
    submittedAt: new Date().toISOString(),
  };

  // 8. Insert and sort
  leaderboard.push(entry);
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > LEADERBOARD_MAX) {
    leaderboard = leaderboard.slice(0, LEADERBOARD_MAX);
  }

  const ttl = 60 * 60 * 24 * 10; // keep for 10 days
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

  const rank = leaderboard.findIndex(e => e.displayName === displayName && e.score === scoreNum) + 1;
  return jsonResponse({ ok: true, rank, total: leaderboard.length });
}

// ── Weekly Leaderboard Fetch ──────────────────────────────────────────────────

async function handleGetWeeklyLeaderboard(weekStr, env) {
  if (!weekStr || !isValidWeek(weekStr)) {
    return jsonResponse({ error: 'Invalid week format. Use YYYY-Www.' }, 400);
  }

  const lbKey = `leaderboard:week:${weekStr}`;
  const leaderboard = (await env.LEADERBOARD_KV.get(lbKey, { type: 'json' })) || [];
  const top20 = leaderboard.slice(0, TOP_N).map((entry, i) => ({
    rank: i + 1,
    displayName: entry.displayName,
    score: entry.score,
    linesCleared: entry.linesCleared,
  }));

  return jsonResponse({ week: weekStr, entries: top20, total: leaderboard.length });
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

    if (method === 'GET' && url.pathname === '/api/missions') {
      response = handleGetMissions(todayUTC());
    } else if (method === 'GET' && url.pathname.startsWith('/api/missions/')) {
      const dateStr = url.pathname.replace('/api/missions/', '');
      response = handleGetMissions(dateStr);
    } else if (method === 'POST' && url.pathname === '/api/scores') {
      response = await handlePostScore(request, env);
    } else if (method === 'POST' && url.pathname === '/api/scores/weekly') {
      response = await handlePostWeeklyScore(request, env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/leaderboard/week/')) {
      const weekStr = url.pathname.replace('/api/leaderboard/week/', '');
      response = await handleGetWeeklyLeaderboard(weekStr, env);
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
