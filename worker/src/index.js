/**
 * MineCtris Daily & Weekly Challenge Leaderboard — Cloudflare Worker
 *
 * Routes:
 *   POST /api/scores               — validate and submit a daily score
 *   GET  /api/leaderboard/:date    — return top 20 for a given date (YYYY-MM-DD)
 *   POST /api/scores/weekly        — validate and submit a weekly score
 *   GET  /api/leaderboard/week/:w  — return top 20 for a given ISO week (YYYY-Www)
 *   GET  /api/season               — return current season config (or { active: false })
 *   GET  /api/leaderboard/season   — return top 20 for the current season
 *   GET  /api/season/archive/:id   — return permanently archived end-of-season results
 *   GET  /api/badges/:displayName  — return all season badges earned by a player
 *   POST /api/puzzles/:id/play     — increment play count for a community puzzle
 *   POST /api/puzzles/:id/vote     — submit thumbs-up or thumbs-down vote for a puzzle
 *   GET  /api/puzzles/featured     — return curated official featured puzzles (admin-seeded)
 *
 * KV Structure (binding: LEADERBOARD_KV):
 *   leaderboard:YYYY-MM-DD        → JSON array of top 100 daily entries, sorted desc by score
 *   player:{name}:{date}          → JSON { submittedAt } for daily rate limiting
 *   flagged:YYYY-MM-DD            → JSON array of flagged daily entries
 *   leaderboard:week:YYYY-Www     → JSON array of top 100 weekly entries, sorted desc by score
 *   player:week:{name}:{weekStr}  → JSON { submittedAt } for weekly rate limiting
 *   ip:week:{hash}:{weekStr}      → JSON { count } for weekly IP rate limiting
 *   ip:{hash}:{date}              → JSON { count } for daily IP rate limiting
 *   season:current                → JSON season config (operator-managed):
 *                                     { seasonId, name, theme, startDate, endDate,
 *                                       leaderboardNamespace, exclusiveSkin, modifier }
 *   season:{seasonId}:leaderboard → JSON array of top 100 season entries, sorted desc by totalScore
 *                                     Each entry: { displayName, totalScore, gamesPlayed,
 *                                                   firstSubmittedAt, lastSubmittedAt }
 *   season:{seasonId}:archive     → JSON permanent archive (no TTL):
 *                                     { seasonId, name, theme, endDate, archivedAt,
 *                                       top10: [{ rank, displayName, totalScore, gamesPlayed, badge }] }
 *   season:{seasonId}:archived    → "1" flag to prevent double-archiving
 *   badge:{displayName}           → JSON array (no TTL), each entry:
 *                                     { seasonId, seasonName, rank, label, icon, awardedAt }
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

  // 10. Update season leaderboard if a season is currently active
  const seasonConfig = await env.LEADERBOARD_KV.get('season:current', { type: 'json' });
  if (seasonConfig && date >= seasonConfig.startDate && date <= seasonConfig.endDate) {
    const seasonLbKey = `season:${seasonConfig.seasonId}:leaderboard`;
    let seasonBoard = (await env.LEADERBOARD_KV.get(seasonLbKey, { type: 'json' })) || [];

    const playerIdx = seasonBoard.findIndex(
      e => e.displayName.toLowerCase() === displayName.toLowerCase()
    );
    if (playerIdx >= 0) {
      seasonBoard[playerIdx].totalScore += scoreNum;
      seasonBoard[playerIdx].gamesPlayed += 1;
      seasonBoard[playerIdx].lastSubmittedAt = entry.submittedAt;
    } else {
      seasonBoard.push({
        displayName,
        totalScore: scoreNum,
        gamesPlayed: 1,
        firstSubmittedAt: entry.submittedAt,
        lastSubmittedAt: entry.submittedAt,
      });
    }

    // Sort: desc totalScore, then asc gamesPlayed (efficiency), then asc firstSubmittedAt
    seasonBoard.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
      return a.firstSubmittedAt.localeCompare(b.firstSubmittedAt);
    });
    if (seasonBoard.length > LEADERBOARD_MAX) {
      seasonBoard = seasonBoard.slice(0, LEADERBOARD_MAX);
    }

    // TTL: 6-week season + 7-day off-season + 30-day buffer
    const seasonTtl = 60 * 60 * 24 * (7 * 6 + 7 + 30);
    await env.LEADERBOARD_KV.put(seasonLbKey, JSON.stringify(seasonBoard), {
      expirationTtl: seasonTtl,
    });
  }

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

// ── Season Config Fetch ───────────────────────────────────────────────────────

async function handleGetSeason(env) {
  const config = await env.LEADERBOARD_KV.get('season:current', { type: 'json' });
  if (!config) {
    return jsonResponse({ active: false });
  }
  const today = todayUTC();
  const active = today >= config.startDate && today <= config.endDate;
  const ended  = today > config.endDate;

  // Trigger archiving in the background when season has just ended
  if (ended) {
    // Use waitUntil if available (proper Cloudflare pattern); fall back to fire-and-forget
    _tryArchiveSeason(config, env).catch(() => {});
  }

  return jsonResponse({ active, ended: ended || undefined, ...config });
}

// ── Season Leaderboard Fetch ──────────────────────────────────────────────────

async function handleGetSeasonLeaderboard(env) {
  const config = await env.LEADERBOARD_KV.get('season:current', { type: 'json' });
  if (!config) {
    return jsonResponse({ error: 'No active season' }, 404);
  }
  const lbKey = `season:${config.seasonId}:leaderboard`;
  const leaderboard = (await env.LEADERBOARD_KV.get(lbKey, { type: 'json' })) || [];
  const top20 = leaderboard.slice(0, TOP_N).map((entry, i) => ({
    rank: i + 1,
    displayName: entry.displayName,
    totalScore: entry.totalScore,
    gamesPlayed: entry.gamesPlayed,
  }));
  return jsonResponse({
    seasonId: config.seasonId,
    seasonName: config.name,
    entries: top20,
    total: leaderboard.length,
  });
}

// ── Season Archive ────────────────────────────────────────────────────────────

const _BADGE_LABELS = ['Champion', 'Veteran', 'Contender'];
const _BADGE_ICONS  = ['🏆', '🥈', '🥉'];

/**
 * Archive the top-10 season leaderboard and distribute badges to top-3.
 * Idempotent: guarded by season:{seasonId}:archived flag.
 */
async function _tryArchiveSeason(config, env) {
  const flagKey = `season:${config.seasonId}:archived`;
  const alreadyDone = await env.LEADERBOARD_KV.get(flagKey);
  if (alreadyDone) return;

  // Set flag first to prevent race conditions (Cloudflare KV is eventually consistent
  // but this is best-effort dedup for the common case).
  await env.LEADERBOARD_KV.put(flagKey, '1');

  const lbKey = `season:${config.seasonId}:leaderboard`;
  const leaderboard = (await env.LEADERBOARD_KV.get(lbKey, { type: 'json' })) || [];
  const top10 = leaderboard.slice(0, 10).map((e, i) => ({
    rank: i + 1,
    displayName: e.displayName,
    totalScore: e.totalScore,
    gamesPlayed: e.gamesPlayed,
    badge: i < 3 ? _BADGE_LABELS[i] : null,
  }));

  const archive = {
    seasonId: config.seasonId,
    name: config.name,
    theme: config.theme,
    endDate: config.endDate,
    archivedAt: new Date().toISOString(),
    top10,
  };

  // Permanent storage (no TTL)
  await env.LEADERBOARD_KV.put(`season:${config.seasonId}:archive`, JSON.stringify(archive));

  // Distribute badges to top-3 players
  const badgePromises = top10.slice(0, 3).map(async (player, i) => {
    const badgeKey = `badge:${player.displayName.toLowerCase()}`;
    const existing = (await env.LEADERBOARD_KV.get(badgeKey, { type: 'json' })) || [];
    existing.push({
      seasonId: config.seasonId,
      seasonName: config.name,
      rank: i + 1,
      label: _BADGE_LABELS[i],
      icon: _BADGE_ICONS[i],
      awardedAt: archive.archivedAt,
    });
    await env.LEADERBOARD_KV.put(badgeKey, JSON.stringify(existing));
  });
  await Promise.all(badgePromises);
}

async function handleGetSeasonArchive(seasonId, env) {
  if (!seasonId) return jsonResponse({ error: 'Missing seasonId' }, 400);
  const archive = await env.LEADERBOARD_KV.get(`season:${seasonId}:archive`, { type: 'json' });
  if (!archive) return jsonResponse({ error: 'Archive not found' }, 404);
  return jsonResponse(archive);
}

async function handleGetBadges(displayName, env) {
  if (!displayName || !DISPLAY_NAME_REGEX.test(displayName)) {
    return jsonResponse({ error: 'Invalid display name' }, 400);
  }
  const badgeKey = `badge:${displayName.toLowerCase()}`;
  const badges = (await env.LEADERBOARD_KV.get(badgeKey, { type: 'json' })) || [];
  return jsonResponse({ displayName, badges });
}

// ── Inline LZ-string decoder (URL-safe variant, from puzzle-codec.js) ─────────
// Only the decompress path is needed for server-side share code validation.

const _WorkerPuzzleLZ = (function () {
  const K = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let R = null;

  function decompress(compressed) {
    if (!compressed) return '';
    if (!R) { R = {}; for (let x = 0; x < K.length; x++) R[K[x]] = x; }
    const BPC = 6, resetVal = 1 << (BPC - 1);
    const data = { v: R[compressed[0]], p: resetVal, i: 1 };
    function nextBit() {
      const b = data.v & data.p;
      data.p >>= 1;
      if (data.p === 0) { data.p = resetVal; data.v = R[compressed[data.i++]] || 0; }
      return b > 0 ? 1 : 0;
    }
    function readBits(n) {
      let val = 0, pw = 1;
      for (let b = 0; b < n; b++) { val += nextBit() * pw; pw <<= 1; }
      return val;
    }
    const dic = [0, 1, 2];
    let dictSize = 3, numBits = 3, enlargeIn = 4;
    function checkEnlarge() { if (--enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; } }
    let bits = readBits(2), c;
    if      (bits === 0) c = String.fromCharCode(readBits(8));
    else if (bits === 1) c = String.fromCharCode(readBits(16));
    else                 return '';
    dic[3] = c; dictSize = 4;
    let w = c; const result = [c];
    while (true) {
      if (data.i > compressed.length) return '';
      bits = readBits(numBits);
      if (bits === 2) break;
      let entry;
      if (bits === 0) { dic[dictSize++] = String.fromCharCode(readBits(8)); bits = dictSize - 1; checkEnlarge(); }
      else if (bits === 1) { dic[dictSize++] = String.fromCharCode(readBits(16)); bits = dictSize - 1; checkEnlarge(); }
      if (dic[bits])          { entry = dic[bits]; }
      else if (bits === dictSize) { entry = w + w[0]; }
      else                    { return null; }
      result.push(entry);
      dic[dictSize++] = w + entry[0];
      checkEnlarge();
      w = entry;
    }
    return result.join('');
  }

  return { decompress };
})();

const PUZZLE_CODEC_VERSION = 2;
const VALID_CODE_RE = /^[A-Za-z0-9\-_]+$/;
const DIFFICULTY_LABELS = ['easy', 'medium', 'hard', 'expert'];
const PUZZLE_INDEX_MAX = 500;
const PUZZLE_RATE_LIMIT_PER_DAY = 5;

/**
 * Validate and decode a puzzle share code.
 * Returns { ok: true, decoded } or { ok: false, error }.
 */
function validateShareCode(code) {
  if (!code || typeof code !== 'string') {
    return { ok: false, error: 'Share code must be a non-empty string' };
  }
  if (code.length < 10 || code.length > 65536) {
    return { ok: false, error: 'Share code length out of range' };
  }
  if (!VALID_CODE_RE.test(code)) {
    return { ok: false, error: 'Share code contains invalid characters' };
  }
  let raw;
  try { raw = _WorkerPuzzleLZ.decompress(code); } catch (_) { raw = null; }
  if (!raw) return { ok: false, error: 'Could not decompress share code' };
  let obj;
  try { obj = JSON.parse(raw); } catch (_) { return { ok: false, error: 'Share code is corrupted' }; }
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Share code is corrupted' };
  if (typeof obj.v === 'number' && obj.v > PUZZLE_CODEC_VERSION) {
    return { ok: false, error: 'Puzzle was created with a newer editor version' };
  }
  if (!obj.wc || typeof obj.wc.m !== 'string') {
    return { ok: false, error: 'Share code is missing win condition' };
  }
  if (!Array.isArray(obj.b)) {
    return { ok: false, error: 'Share code is missing block data' };
  }
  const meta = obj.meta || {};
  return {
    ok: true,
    decoded: {
      name:        String(meta.n || '').slice(0, 40),
      author:      String(meta.a || '').slice(0, 20),
      difficulty:  typeof meta.df === 'number' ? meta.df : 0,
    },
  };
}

// ── Co-op Leaderboard ─────────────────────────────────────────────────────────
//
// KV Structure (binding: COOP_LEADERBOARD):
//   coop:freeplay:{date}       → JSON array, top 100, sorted desc by score
//   coop:daily:{date}          → JSON array, top 100, sorted desc by score
//   coop:pair:{p1}:{p2}:{date} → JSON { submittedAt } for rate limiting
//
// POST /api/leaderboard/coop
//   Body: { score, player1, player2, date, difficulty, isDaily? }
//   Rate limit: one submission per ordered pair per day
//
// GET /api/leaderboard/coop/:date           → freeplay top 10 for that date
// GET /api/leaderboard/coop/daily/:date     → daily-challenge top 10 for that date

const COOP_DISPLAY_NAME_REGEX = /^[a-zA-Z0-9_]{1,16}$/;
const VALID_DIFFICULTIES = new Set(['casual', 'normal', 'challenge']);
const COOP_TOP_N = 10;
const COOP_LB_MAX = 100;
// Generous per-line cap for co-op (two players + difficulty multiplier)
const COOP_MAX_SCORE_PER_LINE = 5000;

/** Canonical pair key (alphabetically ordered so A+B == B+A). */
function _coopPairKey(p1, p2, date) {
  const a = p1.toLowerCase();
  const b = p2.toLowerCase();
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `coop:pair:${lo}:${hi}:${date}`;
}

async function handlePostCoopScore(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { score, player1, player2, date, difficulty, isDaily } = body;

  // Validate player names
  if (!player1 || !COOP_DISPLAY_NAME_REGEX.test(player1)) {
    return jsonResponse({ error: 'Invalid player1 display name' }, 400);
  }
  if (!player2 || !COOP_DISPLAY_NAME_REGEX.test(player2)) {
    return jsonResponse({ error: 'Invalid player2 display name' }, 400);
  }
  if (player1.toLowerCase() === player2.toLowerCase()) {
    return jsonResponse({ error: 'player1 and player2 must be different' }, 400);
  }

  // Validate date
  if (!date || !isValidDate(date) || date !== todayUTC()) {
    return jsonResponse({ error: 'Invalid or stale date' }, 400);
  }

  // Validate difficulty
  if (!difficulty || !VALID_DIFFICULTIES.has(difficulty)) {
    return jsonResponse({ error: 'Invalid difficulty' }, 400);
  }

  // Validate score
  const scoreNum = parseInt(score, 10);
  if (!Number.isInteger(scoreNum) || scoreNum < 0) {
    return jsonResponse({ error: 'Invalid score' }, 400);
  }

  // Rate limit: one submission per pair per day
  const pairKey = _coopPairKey(player1, player2, date);
  const existingEntry = await env.COOP_LEADERBOARD.get(pairKey, { type: 'json' });
  if (existingEntry) {
    return jsonResponse({ error: 'Already submitted today' }, 429);
  }

  const lbType = isDaily ? 'daily' : 'freeplay';
  const lbKey = `coop:${lbType}:${date}`;

  // Load current leaderboard
  let leaderboard = (await env.COOP_LEADERBOARD.get(lbKey, { type: 'json' })) || [];

  const entry = {
    player1,
    player2,
    score: scoreNum,
    difficulty,
    submittedAt: new Date().toISOString(),
  };

  leaderboard.push(entry);
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > COOP_LB_MAX) {
    leaderboard = leaderboard.slice(0, COOP_LB_MAX);
  }

  const ttl = 60 * 60 * 24 * 7; // 7 days
  await Promise.all([
    env.COOP_LEADERBOARD.put(lbKey, JSON.stringify(leaderboard), { expirationTtl: ttl }),
    env.COOP_LEADERBOARD.put(pairKey, JSON.stringify({ submittedAt: entry.submittedAt }), { expirationTtl: ttl }),
  ]);

  const rank = leaderboard.findIndex(
    e => e.player1 === player1 && e.player2 === player2 && e.score === scoreNum
  ) + 1;

  return jsonResponse({ ok: true, rank, total: leaderboard.length });
}

async function handleGetCoopLeaderboard(date, isDaily, env) {
  if (!date || !isValidDate(date)) {
    return jsonResponse({ error: 'Invalid date format. Use YYYY-MM-DD.' }, 400);
  }
  const lbType = isDaily ? 'daily' : 'freeplay';
  const lbKey = `coop:${lbType}:${date}`;
  const leaderboard = (await env.COOP_LEADERBOARD.get(lbKey, { type: 'json' })) || [];
  const topN = leaderboard.slice(0, COOP_TOP_N).map((e, i) => ({
    rank: i + 1,
    player1: e.player1,
    player2: e.player2,
    score: e.score,
    difficulty: e.difficulty,
  }));
  return jsonResponse({ date, isDaily: !!isDaily, entries: topN, total: leaderboard.length });
}

// ── Community Puzzle Handlers ─────────────────────────────────────────────────

async function handlePostPuzzle(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { code } = body;

  // 1. Validate share code
  const validation = validateShareCode(code);
  if (!validation.ok) return jsonResponse({ error: validation.error }, 400);

  const { decoded } = validation;
  const difficulty = DIFFICULTY_LABELS[decoded.difficulty] || 'easy';
  const title  = decoded.name  || 'Untitled';
  const author = decoded.author || 'Anonymous';

  // 2. IP rate limit: 5 publishes per IP per day
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
             '0.0.0.0';
  const ipHash = await hashIP(ip);
  const date = todayUTC();
  const ipKey = `ip:publish:${ipHash}:${date}`;
  const ipEntry = await env.PUZZLES_KV.get(ipKey, { type: 'json' });
  if (ipEntry && ipEntry.count >= PUZZLE_RATE_LIMIT_PER_DAY) {
    return jsonResponse({ error: 'Rate limit exceeded: 5 puzzles per day per IP' }, 429);
  }

  // 3. Generate unique puzzle ID and store
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const createdAt = new Date().toISOString();
  const puzzle = { id, title, author, difficulty, plays: 0, rating: 0, thumbsUp: 0, thumbsDown: 0, createdAt, code };
  const meta   = { id, title, author, difficulty, plays: 0, rating: 0, thumbsUp: 0, thumbsDown: 0, createdAt };

  // 4. Update global index (newest first, capped)
  let index = (await env.PUZZLES_KV.get('puzzles:index', { type: 'json' })) || [];
  index.unshift(meta);
  if (index.length > PUZZLE_INDEX_MAX) index = index.slice(0, PUZZLE_INDEX_MAX);

  await Promise.all([
    env.PUZZLES_KV.put(`puzzle:${id}`, JSON.stringify(puzzle), { expirationTtl: 60 * 60 * 24 * 365 }),
    env.PUZZLES_KV.put('puzzles:index', JSON.stringify(index)),
    env.PUZZLES_KV.put(ipKey, JSON.stringify({ count: (ipEntry?.count || 0) + 1 }), { expirationTtl: 60 * 60 * 24 }),
  ]);

  const origin = (env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*') ? env.ALLOWED_ORIGIN : '';
  const puzzleUrl = `${origin}/?puzzle=${encodeURIComponent(code)}`;
  return jsonResponse({ id, url: puzzleUrl }, 201);
}

async function handleGetPuzzles(request, env) {
  const params = new URL(request.url).searchParams;
  const cursor     = params.get('cursor') || null;
  const difficulty = params.get('difficulty') || null;

  let index = (await env.PUZZLES_KV.get('puzzles:index', { type: 'json' })) || [];

  if (difficulty) {
    const valid = ['easy', 'medium', 'hard', 'expert'];
    if (!valid.includes(difficulty)) return jsonResponse({ error: 'Invalid difficulty filter' }, 400);
    index = index.filter(p => p.difficulty === difficulty);
  }

  let startIdx = 0;
  if (cursor) {
    const pos = index.findIndex(p => p.id === cursor);
    if (pos >= 0) startIdx = pos + 1;
  }

  const page = index.slice(startIdx, startIdx + 20);
  const nextCursor = page.length === 20 && startIdx + 20 < index.length
    ? page[page.length - 1].id
    : null;

  return jsonResponse({ puzzles: page, nextCursor, total: index.length });
}

async function handlePostPuzzlePlay(id, env) {
  if (!id) return jsonResponse({ error: 'Missing puzzle ID' }, 400);

  const puzzleKey = `puzzle:${id}`;
  const puzzle = await env.PUZZLES_KV.get(puzzleKey, { type: 'json' });
  if (!puzzle) return jsonResponse({ error: 'Puzzle not found' }, 404);

  puzzle.plays = (puzzle.plays || 0) + 1;
  const plays = puzzle.plays;

  await env.PUZZLES_KV.put(puzzleKey, JSON.stringify(puzzle), { expirationTtl: 60 * 60 * 24 * 365 });

  // Best-effort index update
  try {
    let index = (await env.PUZZLES_KV.get('puzzles:index', { type: 'json' })) || [];
    const idx = index.findIndex(p => p.id === id);
    if (idx >= 0) {
      index[idx].plays = plays;
      await env.PUZZLES_KV.put('puzzles:index', JSON.stringify(index));
    }
  } catch (_) {}

  return jsonResponse({ ok: true, plays });
}

async function handlePostPuzzleVote(request, id, env) {
  if (!id) return jsonResponse({ error: 'Missing puzzle ID' }, 400);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { vote } = body;
  if (vote !== 'up' && vote !== 'down') {
    return jsonResponse({ error: 'vote must be "up" or "down"' }, 400);
  }

  const puzzleKey = `puzzle:${id}`;
  const puzzle = await env.PUZZLES_KV.get(puzzleKey, { type: 'json' });
  if (!puzzle) return jsonResponse({ error: 'Puzzle not found' }, 404);

  puzzle.thumbsUp   = (puzzle.thumbsUp   || 0) + (vote === 'up'   ? 1 : 0);
  puzzle.thumbsDown = (puzzle.thumbsDown || 0) + (vote === 'down' ? 1 : 0);
  puzzle.rating = puzzle.thumbsUp - puzzle.thumbsDown;

  const { thumbsUp, thumbsDown } = puzzle;

  await env.PUZZLES_KV.put(puzzleKey, JSON.stringify(puzzle), { expirationTtl: 60 * 60 * 24 * 365 });

  // Best-effort index update
  try {
    let index = (await env.PUZZLES_KV.get('puzzles:index', { type: 'json' })) || [];
    const idx = index.findIndex(p => p.id === id);
    if (idx >= 0) {
      index[idx].thumbsUp   = thumbsUp;
      index[idx].thumbsDown = thumbsDown;
      index[idx].rating = thumbsUp - thumbsDown;
      await env.PUZZLES_KV.put('puzzles:index', JSON.stringify(index));
    }
  } catch (_) {}

  return jsonResponse({ ok: true, thumbsUp, thumbsDown });
}

async function handleGetPuzzleById(id, env) {
  if (!id) return jsonResponse({ error: 'Missing puzzle ID' }, 400);
  const puzzle = await env.PUZZLES_KV.get(`puzzle:${id}`, { type: 'json' });
  if (!puzzle) return jsonResponse({ error: 'Puzzle not found' }, 404);
  return jsonResponse(puzzle);
}

async function handleGetFeaturedPuzzles(env) {
  const index = (await env.PUZZLES_KV.get('puzzles:featured', { type: 'json' })) || [];

  // Fetch live play/rating stats from each puzzle's full record
  const puzzles = await Promise.all(
    index.map(async (meta) => {
      const full = await env.PUZZLES_KV.get(`puzzle:${meta.id}`, { type: 'json' });
      if (!full) return null;
      return {
        id: full.id,
        title: full.title,
        author: full.author,
        difficulty: full.difficulty,
        plays: full.plays || 0,
        thumbsUp: full.thumbsUp || 0,
        thumbsDown: full.thumbsDown || 0,
        rating: full.rating || 0,
        featured: true,
        createdAt: full.createdAt,
      };
    })
  );

  return jsonResponse({ puzzles: puzzles.filter(Boolean) });
}

// ── Co-op Room Relay (Durable Object) ────────────────────────────────────────

export class CoopRoom {
  constructor(state, env) {
    this.state = state;
    // Map<playerId ('host'|'guest'), WebSocket>
    this.clients = new Map();
    // Piece sequence PRNG (initialised when host sends game_start)
    this.prng = null;
    this.pieceIndex = 0;
    this.lastPiece = null;
    this.roomCode = null;
  }

  // ── PRNG helpers (mulberry32 — identical to client daily.js) ────────────────

  _mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _hashSeed(str) {
    let h = 0x12345678;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
      h = ((h << 13) | (h >>> 19)) ^ h;
    }
    return h >>> 0;
  }

  _initPrng(roomCode) {
    const seedStr = roomCode + new Date().toISOString().slice(0, 10);
    this.prng = this._mulberry32(this._hashSeed(seedStr));
    this.pieceIndex = 0;
  }

  _generateNextPiece() {
    const rng = this.prng;
    // Standard piece types: indices 1–7 (matching client SHAPES pool)
    const index = Math.floor(rng() * 7) + 1;
    // Spawn position: same formula as client spawnFallingPiece (WORLD_SIZE=50, 0.8 factor)
    const spawnX = (rng() - 0.5) * 40;
    const spawnZ = (rng() - 0.5) * 40;
    // Initial rotation axis and angle (0/90/180/270°)
    const axis = ['x', 'y', 'z'][Math.floor(rng() * 3)];
    const angle = Math.floor(rng() * 4) * (Math.PI / 2);
    // First rotation interval (MIN_ROTATION_INTERVAL=1.5, MAX=4.0)
    const rotationInterval = rng() * 2.5 + 1.5;

    this.pieceIndex++;
    this.lastPiece = { index, spawnX, spawnZ, startRotation: { axis, angle }, rotationInterval, pieceIndex: this.pieceIndex };
    return this.lastPiece;
  }

  _broadcast(msgStr) {
    for (const ws of this.clients.values()) {
      if (ws.readyState === 1 /* OPEN */) ws.send(msgStr);
    }
  }

  // ── WebSocket upgrade ───────────────────────────────────────────────────────

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Capture room code from URL path (/room/CODE/ws) on first connection
    if (!this.roomCode) {
      const parts = new URL(request.url).pathname.split('/');
      this.roomCode = parts[2] || null;
    }

    // Assign slot
    let playerId;
    if (!this.clients.has('host')) {
      playerId = 'host';
    } else if (!this.clients.has('guest')) {
      playerId = 'guest';
    } else {
      return new Response('Room full', { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    this.clients.set(playerId, server);

    // Set 2-hour expiry alarm when the first client joins
    if (this.clients.size === 1) {
      await this.state.storage.setAlarm(Date.now() + 2 * 60 * 60 * 1000);
    }

    // Notify both sides when the second player connects
    if (playerId === 'guest') {
      const joinMsg = JSON.stringify({ type: 'player_joined', playerId: 'guest' });
      const hostWs = this.clients.get('host');
      if (hostWs && hostWs.readyState === 1 /* OPEN */) {
        hostWs.send(joinMsg);
      }
      server.send(JSON.stringify({ type: 'player_joined', playerId: 'host' }));
    }

    server.addEventListener('message', (event) => {
      let msg = null;
      try { msg = JSON.parse(event.data); } catch (_) { /* non-JSON: fall through to relay */ }

      // ── Piece-sequence control messages (host only) ──────────────────────────

      if (msg && msg.type === 'game_start' && playerId === 'host') {
        // Initialise PRNG for this session
        if (!this.prng && this.roomCode) this._initPrng(this.roomCode);
        // Relay game_start to guest only (host already knows it started)
        const guestWs = this.clients.get('guest');
        if (guestWs && guestWs.readyState === 1) {
          guestWs.send(JSON.stringify({ type: 'game_start' }));
        }
        // Pre-broadcast 3 pieces so both clients have a full queue ready
        for (let i = 0; i < 3; i++) {
          this._broadcast(JSON.stringify({ type: 'piece', ...this._generateNextPiece() }));
        }
        return;
      }

      if (msg && msg.type === 'piece_request' && playerId === 'host') {
        if (!this.prng) return; // game not started yet
        this._broadcast(JSON.stringify({ type: 'piece', ...this._generateNextPiece() }));
        return;
      }

      // ── Reconnect resync (any client) ────────────────────────────────────────

      if (msg && msg.type === 'piece_resync') {
        if (this.lastPiece) {
          server.send(JSON.stringify({ type: 'piece', ...this.lastPiece }));
        }
        return;
      }

      // ── Default: relay to partner ─────────────────────────────────────────────

      const otherId = playerId === 'host' ? 'guest' : 'host';
      const otherWs = this.clients.get(otherId);
      if (otherWs && otherWs.readyState === 1 /* OPEN */) {
        otherWs.send(event.data);
      }
    });

    server.addEventListener('close', () => {
      this.clients.delete(playerId);
      const otherId = playerId === 'host' ? 'guest' : 'host';
      const otherWs = this.clients.get(otherId);
      if (otherWs && otherWs.readyState === 1 /* OPEN */) {
        otherWs.send(JSON.stringify({ type: 'player_left', playerId }));
      }
      if (this.clients.size === 0) {
        this.state.storage.deleteAll().catch(() => {});
      }
    });

    server.addEventListener('error', () => {
      this.clients.delete(playerId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    for (const ws of this.clients.values()) {
      try { ws.close(1001, 'Room expired'); } catch (_) {}
    }
    this.clients.clear();
    await this.state.storage.deleteAll();
  }
}

// ── Co-op Room HTTP Handlers ──────────────────────────────────────────────────

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  let code = '';
  for (const byte of bytes) {
    code += ROOM_CODE_CHARS[byte % ROOM_CODE_CHARS.length];
  }
  return code;
}

function roomWsUrl(requestUrl, code) {
  const u = new URL(requestUrl);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}/room/${code}/ws`;
}

async function handleRoomCreate(request, env) {
  const code = generateRoomCode();
  return jsonResponse({ roomCode: code, wsUrl: roomWsUrl(request.url, code) }, 201);
}

async function handleRoomJoin(request, code, env) {
  if (!code || !/^[A-Z0-9]{4}$/.test(code)) {
    return jsonResponse({ error: 'Invalid room code' }, 400);
  }
  return jsonResponse({ wsUrl: roomWsUrl(request.url, code) });
}

async function handleRoomWs(request, code, env) {
  if (!code || !/^[A-Z0-9]{4}$/.test(code)) {
    return jsonResponse({ error: 'Invalid room code' }, 400);
  }
  const id = env.COOP_ROOMS.idFromName(code);
  const stub = env.COOP_ROOMS.get(id);
  return stub.fetch(request);
}

// ── Battle Room Relay (Durable Object) ───────────────────────────────────────
// Identical relay logic to CoopRoom but under mode:"battle".
// No shared PRNG — each player gets independent pieces from the client.

export class BattleRoom {
  constructor(state, env) {
    this.state = state;
    // Map<playerId ('host'|'guest'), WebSocket>
    this.clients = new Map();
    this.roomCode = null;
  }

  _broadcast(msgStr) {
    for (const ws of this.clients.values()) {
      if (ws.readyState === 1 /* OPEN */) ws.send(msgStr);
    }
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    if (!this.roomCode) {
      const parts = new URL(request.url).pathname.split('/');
      // path: /battle/room/CODE/ws → parts[3]
      this.roomCode = parts[3] || null;
    }

    let playerId;
    if (!this.clients.has('host')) {
      playerId = 'host';
    } else if (!this.clients.has('guest')) {
      playerId = 'guest';
    } else {
      return new Response('Room full', { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    this.clients.set(playerId, server);

    if (this.clients.size === 1) {
      await this.state.storage.setAlarm(Date.now() + 2 * 60 * 60 * 1000);
    }

    if (playerId === 'guest') {
      const joinMsg = JSON.stringify({ type: 'player_joined', playerId: 'guest' });
      const hostWs = this.clients.get('host');
      if (hostWs && hostWs.readyState === 1) hostWs.send(joinMsg);
      server.send(JSON.stringify({ type: 'player_joined', playerId: 'host' }));
    }

    server.addEventListener('message', (event) => {
      let msg = null;
      try { msg = JSON.parse(event.data); } catch (_) {}

      if (msg && msg.type === 'ping') {
        server.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // Relay all other messages to the partner
      const otherId = playerId === 'host' ? 'guest' : 'host';
      const otherWs = this.clients.get(otherId);
      if (otherWs && otherWs.readyState === 1) {
        otherWs.send(event.data);
      }
    });

    server.addEventListener('close', () => {
      this.clients.delete(playerId);
      const otherId = playerId === 'host' ? 'guest' : 'host';
      const otherWs = this.clients.get(otherId);
      if (otherWs && otherWs.readyState === 1) {
        otherWs.send(JSON.stringify({ type: 'player_left', playerId }));
      }
      if (this.clients.size === 0) {
        this.state.storage.deleteAll().catch(() => {});
      }
    });

    server.addEventListener('error', () => {
      this.clients.delete(playerId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    for (const ws of this.clients.values()) {
      try { ws.close(1001, 'Room expired'); } catch (_) {}
    }
    this.clients.clear();
    await this.state.storage.deleteAll();
  }
}

// ── Battle Room HTTP Handlers ─────────────────────────────────────────────────

function battleRoomWsUrl(requestUrl, code) {
  const u = new URL(requestUrl);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${u.host}/battle/room/${code}/ws`;
}

async function handleBattleRoomCreate(request, env) {
  const code = generateRoomCode();
  return jsonResponse({ roomCode: code, wsUrl: battleRoomWsUrl(request.url, code) }, 201);
}

async function handleBattleRoomJoin(request, code, env) {
  if (!code || !/^[A-Z0-9]{4}$/.test(code)) {
    return jsonResponse({ error: 'Invalid room code' }, 400);
  }
  return jsonResponse({ wsUrl: battleRoomWsUrl(request.url, code) });
}

async function handleBattleRoomWs(request, code, env) {
  if (!code || !/^[A-Z0-9]{4}$/.test(code)) {
    return jsonResponse({ error: 'Invalid room code' }, 400);
  }
  const id = env.BATTLE_ROOMS.idFromName(code);
  const stub = env.BATTLE_ROOMS.get(id);
  return stub.fetch(request);
}

// ── Battle Quick Match ────────────────────────────────────────────────────────
// KV key: battle:quickmatch:waiting → { roomCode, wsUrl, createdAt }
// A waiting slot expires after 90 seconds (TTL enforced in-code).

async function handleBattleQuickMatch(request, env) {
  const WAITING_KEY = 'battle:quickmatch:waiting';
  const TTL_MS = 90_000;

  const raw = await env.LEADERBOARD_KV.get(WAITING_KEY, { type: 'json' });

  if (raw && raw.createdAt && (Date.now() - raw.createdAt) < TTL_MS) {
    // Found a waiting player — join their room as guest
    await env.LEADERBOARD_KV.delete(WAITING_KEY);
    return jsonResponse({
      waiting: false,
      roomCode: raw.roomCode,
      wsUrl: raw.wsUrl,
    });
  }

  // No valid waiting slot — create a room and wait as host
  const code = generateRoomCode();
  const wsUrl = battleRoomWsUrl(request.url, code);
  await env.LEADERBOARD_KV.put(WAITING_KEY, JSON.stringify({
    roomCode: code,
    wsUrl,
    createdAt: Date.now(),
  }), { expirationTtl: 120 }); // 2-minute KV TTL as safety net

  return jsonResponse({ waiting: true, roomCode: code, wsUrl }, 201);
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

    if (method === 'POST' && url.pathname === '/room/create') {
      response = await handleRoomCreate(request, env);
    } else if (method === 'GET' && /^\/room\/[A-Z0-9]{4}\/join$/.test(url.pathname)) {
      const code = url.pathname.split('/')[2];
      response = await handleRoomJoin(request, code, env);
    } else if (/^\/room\/[A-Z0-9]{4}\/ws$/.test(url.pathname)) {
      const code = url.pathname.split('/')[2];
      // WebSocket upgrade — bypass CORS header merging below and return directly
      return handleRoomWs(request, code, env);
    } else if (method === 'POST' && url.pathname === '/battle/room/create') {
      response = await handleBattleRoomCreate(request, env);
    } else if (method === 'GET' && /^\/battle\/room\/[A-Z0-9]{4}\/join$/.test(url.pathname)) {
      const code = url.pathname.split('/')[3];
      response = await handleBattleRoomJoin(request, code, env);
    } else if (/^\/battle\/room\/[A-Z0-9]{4}\/ws$/.test(url.pathname)) {
      const code = url.pathname.split('/')[3];
      return handleBattleRoomWs(request, code, env);
    } else if (method === 'POST' && url.pathname === '/battle/quickmatch') {
      response = await handleBattleQuickMatch(request, env);
    } else if (method === 'POST' && url.pathname === '/api/puzzles') {
      response = await handlePostPuzzle(request, env);
    } else if (method === 'GET' && url.pathname === '/api/puzzles') {
      response = await handleGetPuzzles(request, env);
    } else if (method === 'POST' && url.pathname.startsWith('/api/puzzles/') && url.pathname.endsWith('/play')) {
      const puzzleId = url.pathname.slice('/api/puzzles/'.length, -'/play'.length);
      response = await handlePostPuzzlePlay(puzzleId, env);
    } else if (method === 'POST' && url.pathname.startsWith('/api/puzzles/') && url.pathname.endsWith('/vote')) {
      const puzzleId = url.pathname.slice('/api/puzzles/'.length, -'/vote'.length);
      response = await handlePostPuzzleVote(request, puzzleId, env);
    } else if (method === 'GET' && url.pathname === '/api/puzzles/featured') {
      response = await handleGetFeaturedPuzzles(env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/puzzles/')) {
      const puzzleId = url.pathname.replace('/api/puzzles/', '');
      response = await handleGetPuzzleById(puzzleId, env);
    } else if (method === 'GET' && url.pathname === '/api/missions') {
      response = handleGetMissions(todayUTC());
    } else if (method === 'GET' && url.pathname.startsWith('/api/missions/')) {
      const dateStr = url.pathname.replace('/api/missions/', '');
      response = handleGetMissions(dateStr);
    } else if (method === 'POST' && url.pathname === '/api/scores') {
      response = await handlePostScore(request, env);
    } else if (method === 'POST' && url.pathname === '/api/scores/weekly') {
      response = await handlePostWeeklyScore(request, env);
    } else if (method === 'GET' && url.pathname === '/api/season') {
      response = await handleGetSeason(env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/season/archive/')) {
      const seasonId = url.pathname.replace('/api/season/archive/', '');
      response = await handleGetSeasonArchive(seasonId, env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/badges/')) {
      const displayName = url.pathname.replace('/api/badges/', '');
      response = await handleGetBadges(displayName, env);
    } else if (method === 'GET' && url.pathname === '/api/leaderboard/season') {
      response = await handleGetSeasonLeaderboard(env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/leaderboard/week/')) {
      const weekStr = url.pathname.replace('/api/leaderboard/week/', '');
      response = await handleGetWeeklyLeaderboard(weekStr, env);
    } else if (method === 'POST' && url.pathname === '/api/leaderboard/coop') {
      response = await handlePostCoopScore(request, env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/leaderboard/coop/daily/')) {
      const date = url.pathname.replace('/api/leaderboard/coop/daily/', '');
      response = await handleGetCoopLeaderboard(date, true, env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/leaderboard/coop/')) {
      const date = url.pathname.replace('/api/leaderboard/coop/', '');
      response = await handleGetCoopLeaderboard(date, false, env);
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
