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
 *   POST /api/battle/ratings       — submit player battle rating (once per day)
 *   GET  /api/battle/ratings       — return top-100 global battle rating leaderboard
 *   GET  /api/season/ratings       — return top-100 season battle rating leaderboard
 *   GET  /api/season/hall-of-fame  — list of all past seasons with champions
 *   GET  /api/season/rating-snapshot/:id — top-100 rating archive for a past season
 *   POST /api/puzzles/:id/play     — increment play count for a community puzzle
 *   POST /api/puzzles/:id/vote     — submit thumbs-up or thumbs-down vote for a puzzle
 *   GET  /api/puzzles/featured     — return curated official featured puzzles (admin-seeded)
 *
 * Guild Routes:
 *   POST   /api/guilds                                   — create guild (caller = owner)
 *   GET    /api/guilds                                   — search guilds by name/tag (?search=query)
 *   GET    /api/guilds/:guildId                          — get guild + member list
 *   PATCH  /api/guilds/:guildId                          — update name/description/emblem/isPrivate (owner/officer only)
 *   DELETE /api/guilds/:guildId                          — disband guild (owner only)
 *   POST   /api/clan-wars                                — send a war challenge { actorId, challengerGuildId, targetGuildId, proposedWindowStart }
 *   GET    /api/clan-wars/:warId                         — get war + rosters
 *   POST   /api/clan-wars/:warId/respond                 — { actorId, actorGuildId, action:'accept'|'counter'|'decline', counterWindowStart? }
 *   POST   /api/clan-wars/:warId/nominate                — { actorId, actorGuildId, nomineeUserId }
 *   DELETE /api/clan-wars/:warId/nominate/:userId        — { actorId, actorGuildId }
 *   POST   /api/clan-wars/:warId/complete                — { winnerGuildId }
 *   POST   /api/clan-wars/:warId/tick                    — advance state machine
 *   GET    /api/guilds/:guildId/clan-wars                — list war summaries for a guild
 *
 *   POST   /api/guilds/:guildId/invite                   — invite a player by username { inviterId, inviteeUsername }
 *   POST   /api/guilds/:guildId/join-requests            — submit a join request { userId }
 *   GET    /api/guilds/:guildId/join-requests            — list pending requests (officer/owner) { actorId }
 *   PATCH  /api/guilds/:guildId/join-requests/:uid       — approve or deny { actorId, action:'approve'|'deny' }
 *   POST   /api/guilds/:guildId/leave                    — leave the guild { userId }
 *   POST   /api/guilds/:guildId/kick                     — kick a member { actorId, targetUserId }
 *   POST   /api/guilds/:guildId/promote                  — change member role { actorId, targetUserId, newRole }
 *   GET    /api/guilds/:guildId/leaderboard              — weekly contribution leaderboard + last week snapshot
 *   GET    /api/guilds/:guildId/weekly-notification      — fetch + clear pending weekly summary notification (?userId=X)
 *   GET    /api/guild-invites?userId=:id                 — get pending invites for a user
 *   POST   /api/guild-invites/:inviteId/accept           — accept an invite { userId }
 *   POST   /api/guild-invites/:inviteId/decline          — decline an invite { userId }
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
 *   season:{seasonId}:archived        → "1" flag to prevent double-archiving
 *   season:{seasonId}:rating-leaderboard → JSON top-100 by battle rating for this season
 *   season:{seasonId}:rating-snapshot    → Permanent top-100 rating archive at season end
 *   season:hall-of-fame               → JSON array of past season summaries (permanent)
 *   battle:leaderboard                → JSON top-100 global battle ratings (no TTL)
 *   battle:submitted:{name}:{date}    → { submittedAt } — rate limit: 1 per player per day
 *   badge:{displayName}               → JSON array (no TTL), each entry:
 *                                        { seasonId, seasonName, rank, label, icon, awardedAt }
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
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
  const active   = today >= config.startDate && today <= config.endDate;
  const ended    = today > config.endDate;
  const upcoming = today < config.startDate;

  // Trigger archiving in the background when season has just ended
  if (ended) {
    // Use waitUntil if available (proper Cloudflare pattern); fall back to fire-and-forget
    _tryArchiveSeason(config, env).catch(() => {});
  }

  return jsonResponse({
    active,
    ended:    ended    || undefined,
    upcoming: upcoming || undefined,
    ...config,
  });
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

// ── Battle Rating Submission ──────────────────────────────────────────────────

const BATTLE_LB_KEY = 'battle:leaderboard';

async function handlePostBattleRating(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { displayName, rating, wins, losses, draws, date, clientTimestamp } = body;

  if (!displayName || !DISPLAY_NAME_REGEX.test(displayName)) {
    return jsonResponse({ error: 'Invalid display name' }, 400);
  }
  if (!date || !isValidDate(date) || date !== todayUTC()) {
    return jsonResponse({ error: 'Invalid or stale date' }, 400);
  }
  const ratingNum = parseInt(rating, 10);
  if (!Number.isInteger(ratingNum) || ratingNum < 0 || ratingNum > 9999) {
    return jsonResponse({ error: 'Invalid rating' }, 400);
  }

  // Rate limit: 1 submission per player per day
  const submittedKey = `battle:submitted:${displayName.toLowerCase()}:${date}`;
  const existing = await env.LEADERBOARD_KV.get(submittedKey, { type: 'json' });
  if (existing) {
    return jsonResponse({ error: 'Already submitted today' }, 429);
  }

  const now = new Date().toISOString();
  const entry = {
    displayName,
    rating: ratingNum,
    wins:   Math.max(0, parseInt(wins,   10) || 0),
    losses: Math.max(0, parseInt(losses, 10) || 0),
    draws:  Math.max(0, parseInt(draws,  10) || 0),
    updatedAt: now,
  };

  // Load global battle leaderboard, upsert, sort, truncate
  let battleLb = (await env.LEADERBOARD_KV.get(BATTLE_LB_KEY, { type: 'json' })) || [];
  const existingIdx = battleLb.findIndex(e => e.displayName.toLowerCase() === displayName.toLowerCase());
  if (existingIdx >= 0) {
    battleLb[existingIdx] = entry;
  } else {
    battleLb.push(entry);
  }
  battleLb.sort((a, b) => b.rating - a.rating);
  if (battleLb.length > LEADERBOARD_MAX) battleLb = battleLb.slice(0, LEADERBOARD_MAX);

  const writes = [
    env.LEADERBOARD_KV.put(BATTLE_LB_KEY, JSON.stringify(battleLb)),
    env.LEADERBOARD_KV.put(submittedKey, JSON.stringify({ submittedAt: now }), {
      expirationTtl: 60 * 60 * 24 * 2,
    }),
  ];

  // If season active, also update season rating leaderboard
  const seasonConfig = await env.LEADERBOARD_KV.get('season:current', { type: 'json' });
  if (seasonConfig && date >= seasonConfig.startDate && date <= seasonConfig.endDate) {
    const seasonRatingKey = `season:${seasonConfig.seasonId}:rating-leaderboard`;
    let seasonRatingLb = (await env.LEADERBOARD_KV.get(seasonRatingKey, { type: 'json' })) || [];
    const sIdx = seasonRatingLb.findIndex(e => e.displayName.toLowerCase() === displayName.toLowerCase());
    if (sIdx >= 0) {
      seasonRatingLb[sIdx] = entry;
    } else {
      seasonRatingLb.push(entry);
    }
    seasonRatingLb.sort((a, b) => b.rating - a.rating);
    if (seasonRatingLb.length > LEADERBOARD_MAX) seasonRatingLb = seasonRatingLb.slice(0, LEADERBOARD_MAX);
    const seasonTtl = 60 * 60 * 24 * (7 * 6 + 7 + 30);
    writes.push(env.LEADERBOARD_KV.put(seasonRatingKey, JSON.stringify(seasonRatingLb), {
      expirationTtl: seasonTtl,
    }));
  }

  await Promise.all(writes);

  const rank = battleLb.findIndex(e => e.displayName.toLowerCase() === displayName.toLowerCase()) + 1;
  return jsonResponse({ ok: true, rank, total: battleLb.length });
}

async function handleGetBattleLeaderboard(env) {
  const leaderboard = (await env.LEADERBOARD_KV.get(BATTLE_LB_KEY, { type: 'json' })) || [];
  const top = leaderboard.slice(0, TOP_N).map((e, i) => ({
    rank:    i + 1,
    displayName: e.displayName,
    rating:  e.rating,
    wins:    e.wins   || 0,
    losses:  e.losses || 0,
    draws:   e.draws  || 0,
  }));
  return jsonResponse({ entries: top, total: leaderboard.length });
}

async function handleGetSeasonRatingLeaderboard(request, env) {
  const config = await env.LEADERBOARD_KV.get('season:current', { type: 'json' });
  if (!config) return jsonResponse({ error: 'No active season' }, 404);

  const key = `season:${config.seasonId}:rating-leaderboard`;
  const leaderboard = (await env.LEADERBOARD_KV.get(key, { type: 'json' })) || [];
  const entries = leaderboard.map((e, i) => ({
    rank:    i + 1,
    displayName: e.displayName,
    rating:  e.rating,
    wins:    e.wins   || 0,
    losses:  e.losses || 0,
    draws:   e.draws  || 0,
  }));

  // If caller provides displayName and they're outside top-100, include their rank/entry
  const qName = new URL(request.url).searchParams.get('displayName') || '';
  let playerEntry = null;
  if (qName && DISPLAY_NAME_REGEX.test(qName)) {
    const idx = leaderboard.findIndex(e => e.displayName.toLowerCase() === qName.toLowerCase());
    if (idx >= 0) {
      playerEntry = { rank: idx + 1, ...leaderboard[idx] };
    } else {
      // Not in top-100; rank is unknown server-side
      playerEntry = { rank: null };
    }
  }

  return jsonResponse({
    seasonId:   config.seasonId,
    seasonName: config.name,
    entries,
    total:       leaderboard.length,
    playerEntry,
  });
}

async function handleGetHallOfFame(env) {
  const list = (await env.LEADERBOARD_KV.get('season:hall-of-fame', { type: 'json' })) || [];
  return jsonResponse({ seasons: list });
}

async function handleGetSeasonRatingSnapshot(seasonId, env) {
  if (!seasonId) return jsonResponse({ error: 'Missing seasonId' }, 400);
  const snapshot = await env.LEADERBOARD_KV.get(`season:${seasonId}:rating-snapshot`, { type: 'json' });
  if (!snapshot) return jsonResponse({ error: 'Snapshot not found' }, 404);
  return jsonResponse(snapshot);
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

  // Archive top-100 rating snapshot at season end
  const ratingLbKey = `season:${config.seasonId}:rating-leaderboard`;
  const ratingLb = (await env.LEADERBOARD_KV.get(ratingLbKey, { type: 'json' })) || [];
  const ratingTop100 = ratingLb.map((e, i) => ({
    rank:    i + 1,
    displayName: e.displayName,
    rating:  e.rating,
    wins:    e.wins   || 0,
    losses:  e.losses || 0,
    draws:   e.draws  || 0,
  }));
  const ratingSnapshot = {
    seasonId:   config.seasonId,
    name:       config.name,
    theme:      config.theme,
    endDate:    config.endDate,
    archivedAt: archive.archivedAt,
    top100:     ratingTop100,
  };
  await env.LEADERBOARD_KV.put(
    `season:${config.seasonId}:rating-snapshot`,
    JSON.stringify(ratingSnapshot)
  );

  // Update hall-of-fame list (permanent, newest first)
  const champion = ratingTop100.length > 0 ? ratingTop100[0] : null;
  let hofList = (await env.LEADERBOARD_KV.get('season:hall-of-fame', { type: 'json' })) || [];
  if (!hofList.find(s => s.seasonId === config.seasonId)) {
    hofList.unshift({
      seasonId:   config.seasonId,
      name:       config.name,
      theme:      config.theme,
      endDate:    config.endDate,
      archivedAt: archive.archivedAt,
      champion:   champion ? { displayName: champion.displayName, rating: champion.rating } : null,
    });
    await env.LEADERBOARD_KV.put('season:hall-of-fame', JSON.stringify(hofList));
  }

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
    this.env = env;
    // Map<playerId ('host'|'guest'), WebSocket>
    this.clients = new Map();
    // Map<spectatorId, WebSocket> — up to 50 spectators
    this.spectators = new Map();
    this.roomCode = null;
    this.isPrivate = false;
    this.isTournament = false;
    this._spectatorSeq = 0;
  }

  // Broadcast to players only
  _broadcast(msgStr) {
    for (const ws of this.clients.values()) {
      if (ws.readyState === 1 /* OPEN */) ws.send(msgStr);
    }
  }

  // Broadcast to spectators only
  _broadcastSpectators(msgStr) {
    for (const ws of this.spectators.values()) {
      if (ws.readyState === 1 /* OPEN */) ws.send(msgStr);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    // Non-WebSocket: return room info (used by spectate endpoint)
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      if (url.searchParams.get('info') === '1') {
        return new Response(JSON.stringify({
          playerCount: this.clients.size,
          spectatorCount: this.spectators.size,
          isPrivate: this.isPrivate,
          isTournament: this.isTournament,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    if (!this.roomCode) {
      const parts = url.pathname.split('/');
      // path: /battle/room/CODE/ws → parts[3]
      this.roomCode = parts[3] || null;
    }

    const isSpectator = url.searchParams.get('role') === 'spectator';

    if (isSpectator) {
      // Spectator join
      if (this.isPrivate) {
        return new Response(JSON.stringify({ error: 'Room is private' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      if (this.spectators.size >= 50) {
        return new Response(JSON.stringify({ error: 'Spectator cap reached' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
      return this._acceptSpectator(request);
    }

    // Player join
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

      // Room control messages (host only)
      if (msg && msg.type === 'room_set_private' && playerId === 'host') {
        // Tournament matches cannot be made private
        if (!this.isTournament) {
          this.isPrivate = !!msg.isPrivate;
        }
        server.send(JSON.stringify({ type: 'room_privacy_ack', isPrivate: this.isPrivate }));
        return;
      }
      if (msg && msg.type === 'room_set_tournament' && playerId === 'host') {
        this.isTournament = true;
        this.isPrivate = false; // tournament rooms are always public
        return;
      }

      // Relay all other messages to the partner AND to spectators for game messages
      const otherId = playerId === 'host' ? 'guest' : 'host';
      const otherWs = this.clients.get(otherId);
      if (otherWs && otherWs.readyState === 1) {
        otherWs.send(event.data);
      }

      // Relay game state messages to spectators, tagging which player sent it
      const SPECTATOR_RELAY_TYPES = new Set([
        'battle_board', 'battle_attack', 'battle_score_race_end',
        'battle_game_over', 'battle_start', 'battle_mode', 'battle_rating',
        'battle_powerup',
      ]);
      if (msg && SPECTATOR_RELAY_TYPES.has(msg.type) && this.spectators.size > 0) {
        const relayMsg = JSON.stringify(Object.assign({}, msg, { fromPlayer: playerId }));
        this._broadcastSpectators(relayMsg);
      }

      // When spectator joins, players will receive spectator_joined and should send board state
    });

    server.addEventListener('close', () => {
      this.clients.delete(playerId);
      const otherId = playerId === 'host' ? 'guest' : 'host';
      const otherWs = this.clients.get(otherId);
      if (otherWs && otherWs.readyState === 1) {
        otherWs.send(JSON.stringify({ type: 'player_left', playerId }));
      }
      // Notify spectators the match ended
      if (this.spectators.size > 0) {
        this._broadcastSpectators(JSON.stringify({ type: 'player_left', playerId }));
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

  _acceptSpectator(request) {
    const specId = 'spectator_' + (this._spectatorSeq++);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    this.spectators.set(specId, server);

    // Notify players a spectator joined (so they can send board state)
    const count = this.spectators.size;
    this._broadcast(JSON.stringify({ type: 'spectator_joined', spectatorCount: count }));

    // Welcome the spectator with current room state
    server.send(JSON.stringify({
      type: 'spectator_welcome',
      spectatorCount: count,
      isPrivate: this.isPrivate,
      isTournament: this.isTournament,
      playersConnected: this.clients.size,
      mySpecId: specId,
    }));

    server.addEventListener('message', (event) => {
      let msg = null;
      try { msg = JSON.parse(event.data); } catch (_) {}
      if (!msg) return;

      if (msg.type === 'ping') {
        server.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // Relay emoji reactions to all spectators; also poke players with a hype tick
      if (msg.type === 'spectator_reaction') {
        const VALID_EMOJIS = new Set(['fire','clap','shocked','skull','diamond','crown']);
        const emoji = typeof msg.emoji === 'string' && VALID_EMOJIS.has(msg.emoji) ? msg.emoji : null;
        if (emoji) {
          this._broadcastSpectators(JSON.stringify({ type: 'spectator_reaction', emoji, specId }));
          this._broadcast(JSON.stringify({ type: 'spectator_hype_tick' }));
        }
        return;
      }

      // Relay chat messages to all spectators (server enforces 100-char limit)
      if (msg.type === 'spectator_chat') {
        const text = typeof msg.text === 'string' ? msg.text.slice(0, 100).trim() : '';
        const name = typeof msg.name === 'string' ? msg.name.slice(0, 24).trim() : 'Anon';
        if (text.length > 0) {
          this._broadcastSpectators(JSON.stringify({ type: 'spectator_chat', text, name, specId }));
        }
        return;
      }

      // Relay spectator name registration (for the spectator list in the chat header)
      if (msg.type === 'spectator_hello') {
        const name = typeof msg.name === 'string' ? msg.name.slice(0, 24).trim() : '';
        if (name) {
          this._broadcastSpectators(JSON.stringify({ type: 'spectator_hello', name, specId }));
        }
        return;
      }
    });

    server.addEventListener('close', () => {
      this.spectators.delete(specId);
      const updatedCount = this.spectators.size;
      this._broadcast(JSON.stringify({ type: 'spectator_count', spectatorCount: updatedCount }));
    });

    server.addEventListener('error', () => {
      this.spectators.delete(specId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    for (const ws of this.clients.values()) {
      try { ws.close(1001, 'Room expired'); } catch (_) {}
    }
    for (const ws of this.spectators.values()) {
      try { ws.close(1001, 'Room expired'); } catch (_) {}
    }
    this.clients.clear();
    this.spectators.clear();
    await this.state.storage.deleteAll();
  }
}

// ── Battle Room HTTP Handlers ─────────────────────────────────────────────────

function battleRoomWsUrl(requestUrl, code, role) {
  const u = new URL(requestUrl);
  const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${proto}//${u.host}/battle/room/${code}/ws`;
  return role ? base + '?role=' + role : base;
}

async function handleBattleRoomCreate(request, env) {
  const code = generateRoomCode();
  // Register in KV for live room discovery (TTL: 2 hours)
  if (env.LEADERBOARD_KV) {
    await env.LEADERBOARD_KV.put(
      'battle:live:' + code,
      JSON.stringify({ code, createdAt: Date.now(), isPrivate: false, isTournament: false }),
      { expirationTtl: 7200 }
    ).catch(() => {});
  }
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

async function handleBattleRoomSpectate(request, code, env) {
  if (!code || !/^[A-Z0-9]{4}$/.test(code)) {
    return jsonResponse({ error: 'Invalid room code' }, 400);
  }
  // Query the DO for current room info before returning wsUrl
  try {
    const id = env.BATTLE_ROOMS.idFromName(code);
    const stub = env.BATTLE_ROOMS.get(id);
    const infoUrl = new URL(request.url);
    infoUrl.pathname = '/battle/room/' + code + '/ws';
    infoUrl.search = '?info=1';
    const infoResp = await stub.fetch(infoUrl.toString());
    if (infoResp.ok) {
      const info = await infoResp.json();
      if (info.isPrivate) return jsonResponse({ error: 'Room is private' }, 403);
      if (info.spectatorCount >= 50) return jsonResponse({ error: 'Spectator cap reached', full: true }, 409);
      const wsUrl = battleRoomWsUrl(request.url, code, 'spectator');
      return jsonResponse({ wsUrl, spectatorCount: info.spectatorCount, playersConnected: info.playerCount });
    }
  } catch (_) {}
  // Fallback: just provide wsUrl and let the DO reject if needed
  const wsUrl = battleRoomWsUrl(request.url, code, 'spectator');
  return jsonResponse({ wsUrl, spectatorCount: 0 });
}

async function handleBattleRoomsLive(request, env) {
  if (!env.LEADERBOARD_KV) return jsonResponse({ rooms: [] });
  try {
    const list = await env.LEADERBOARD_KV.list({ prefix: 'battle:live:' });
    const rooms = [];
    for (const key of list.keys) {
      const raw = await env.LEADERBOARD_KV.get(key.name, { type: 'json' }).catch(() => null);
      if (raw) {
        // Query DO for live spectator count and match status
        const code = raw.code || key.name.replace('battle:live:', '');
        try {
          const id = env.BATTLE_ROOMS.idFromName(code);
          const stub = env.BATTLE_ROOMS.get(id);
          const infoUrl = new URL(request.url);
          infoUrl.pathname = '/battle/room/' + code + '/ws';
          infoUrl.search = '?info=1';
          const infoResp = await stub.fetch(infoUrl.toString());
          if (infoResp.ok) {
            const info = await infoResp.json();
            if (!info.isPrivate && info.playerCount > 0) {
              rooms.push({
                code,
                spectatorCount: info.spectatorCount,
                playerCount: info.playerCount,
                isTournament: info.isTournament,
                spectatorFull: info.spectatorCount >= 50,
              });
            }
          }
        } catch (_) {}
      }
    }
    return jsonResponse({ rooms });
  } catch (_) {
    return jsonResponse({ rooms: [] });
  }
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

// ── Tournament Engine ─────────────────────────────────────────────────────────

/**
 * TournamentEngine Durable Object
 *
 * Stores the full bracket state for a single 8-player single-elimination
 * tournament. Authoritative source; mirrors to TOURNAMENTS_KV after each write.
 *
 * HTTP RPC interface (called from the main worker fetch handler):
 *   PUT  /init            → { id, players }  — initialize bracket (idempotent)
 *   GET  /                → full tournament state
 *   POST /match-complete  → { matchId, winnerId }  — advance bracket
 */
export class TournamentEngine {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'PUT' && url.pathname === '/init') {
      return this._init(await request.json());
    } else if (method === 'GET' && url.pathname === '/') {
      return this._getState();
    } else if (method === 'POST' && url.pathname === '/match-complete') {
      return this._matchComplete(await request.json());
    } else if (method === 'POST' && url.pathname === '/match-join') {
      return this._matchJoin(await request.json());
    } else if (method === 'POST' && url.pathname === '/match-heartbeat') {
      return this._matchHeartbeat(await request.json());
    }
    return this._doResponse({ error: 'Not found' }, 404);
  }

  async _init({ id, players }) {
    const existing = await this.state.storage.get('tournament');
    if (existing) {
      return this._doResponse(existing, 200);
    }
    const tournament = _buildTournament(id, players);
    await this.state.storage.put('tournament', tournament);
    await this._mirrorToKV(tournament);
    this._scheduleNextAlarm(tournament);
    return this._doResponse(tournament, 201);
  }

  async _getState() {
    const tournament = await this.state.storage.get('tournament');
    if (!tournament) return this._doResponse({ error: 'Tournament not found' }, 404);
    return this._doResponse(tournament);
  }

  async _matchComplete({ matchId, winnerId }) {
    const tournament = await this.state.storage.get('tournament');
    if (!tournament) return this._doResponse({ error: 'Tournament not found' }, 404);

    const match = tournament.matches.find(m => m.id === matchId);
    if (!match) return this._doResponse({ error: 'Match not found' }, 404);
    if (match.status !== 'in_progress') {
      return this._doResponse({ error: `Match is ${match.status}, not in_progress` }, 400);
    }
    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      return this._doResponse({ error: 'Winner is not a participant in this match' }, 400);
    }

    match.status = 'complete';
    match.winnerId = winnerId;
    this._advanceBracket(tournament, match);

    await this.state.storage.put('tournament', tournament);
    await this._mirrorToKV(tournament);
    this._scheduleNextAlarm(tournament);
    return this._doResponse(tournament);
  }

  // Player signals readiness within the 60-second join window.
  async _matchJoin({ matchId, playerId }) {
    const tournament = await this.state.storage.get('tournament');
    if (!tournament) return this._doResponse({ error: 'Tournament not found' }, 404);

    const match = tournament.matches.find(m => m.id === matchId);
    if (!match) return this._doResponse({ error: 'Match not found' }, 404);
    if (match.status !== 'in_progress') {
      return this._doResponse({ error: `Match is ${match.status}, not in_progress` }, 400);
    }
    if (playerId !== match.player1Id && playerId !== match.player2Id) {
      return this._doResponse({ error: 'Player is not a participant in this match' }, 400);
    }
    if (match.joinDeadline && Date.now() > match.joinDeadline) {
      return this._doResponse({ error: 'Join deadline has passed' }, 410);
    }

    if (!match.joinedPlayerIds) match.joinedPlayerIds = [];
    if (!match.joinedPlayerIds.includes(playerId)) {
      match.joinedPlayerIds.push(playerId);
    }
    if (!match.heartbeats) match.heartbeats = {};
    match.heartbeats[playerId] = Date.now();

    await this.state.storage.put('tournament', tournament);
    await this._mirrorToKV(tournament);
    this._scheduleNextAlarm(tournament);
    return this._doResponse(tournament);
  }

  // Player liveness signal; must be sent every ≤ 20s to avoid disconnect forfeit (30s threshold).
  async _matchHeartbeat({ matchId, playerId }) {
    const tournament = await this.state.storage.get('tournament');
    if (!tournament) return this._doResponse({ error: 'Tournament not found' }, 404);

    const match = tournament.matches.find(m => m.id === matchId);
    if (!match) return this._doResponse({ error: 'Match not found' }, 404);
    if (match.status !== 'in_progress') {
      return this._doResponse({ error: `Match is ${match.status}` }, 400);
    }
    if (playerId !== match.player1Id && playerId !== match.player2Id) {
      return this._doResponse({ error: 'Player is not a participant in this match' }, 400);
    }
    const joinedSet = new Set(match.joinedPlayerIds || []);
    if (!joinedSet.has(playerId)) {
      return this._doResponse({ error: 'Player has not joined this match yet' }, 400);
    }

    if (!match.heartbeats) match.heartbeats = {};
    match.heartbeats[playerId] = Date.now();

    await this.state.storage.put('tournament', tournament);
    this._scheduleNextAlarm(tournament);
    return this._doResponse({ ok: true, matchId, playerId });
  }

  // Durable Object alarm: fires at the earliest pending join-deadline or disconnect-timeout.
  async alarm() {
    const tournament = await this.state.storage.get('tournament');
    if (!tournament) return;

    const now = Date.now();
    let modified = false;

    for (const match of tournament.matches) {
      if (match.status !== 'in_progress') continue;

      const players = [match.player1Id, match.player2Id].filter(Boolean);
      const joinedSet = new Set(match.joinedPlayerIds || []);

      // Check join deadline — forfeit players who didn't join in time.
      if (match.joinDeadline && now >= match.joinDeadline) {
        const notJoined = players.filter(p => !joinedSet.has(p));
        if (notJoined.length >= 1) {
          // At least one player timed out; opponent wins (or player1 wins if both forfeited).
          const winner = players.find(p => joinedSet.has(p)) || match.player1Id;
          match.status = 'complete';
          match.winnerId = winner;
          match.forfeitReason = 'timeout';
          this._advanceBracket(tournament, match);
          modified = true;
          continue;
        }
        // Both joined on time — clear deadline.
        match.joinDeadline = null;
        modified = true;
      }

      // Check disconnect timeout for joined players (30-second threshold).
      if (match.heartbeats) {
        for (const playerId of players) {
          if (!joinedSet.has(playerId)) continue;
          const lastSeen = match.heartbeats[playerId];
          if (lastSeen && now - lastSeen >= 30_000) {
            const opponent = players.find(p => p !== playerId);
            if (opponent) {
              match.status = 'complete';
              match.winnerId = opponent;
              match.forfeitReason = 'disconnect';
              this._advanceBracket(tournament, match);
              modified = true;
              break;
            }
          }
        }
      }
    }

    if (modified) {
      await this.state.storage.put('tournament', tournament);
      await this._mirrorToKV(tournament);
    }
    this._scheduleNextAlarm(tournament);
  }

  // Advance the bracket after a match completes (assumes match.status = 'complete', match.winnerId set).
  _advanceBracket(tournament, match) {
    const winnerId = match.winnerId;
    if (match.nextMatchId) {
      const next = tournament.matches.find(m => m.id === match.nextMatchId);
      if (next) {
        if (match.nextMatchSlot === 1) next.player1Id = winnerId;
        else next.player2Id = winnerId;
        if (next.player1Id && next.player2Id) {
          next.status = 'in_progress';
          next.joinDeadline = Date.now() + 60_000;
        }
      }
    } else {
      // Final complete — tournament done.
      tournament.status = 'complete';
      tournament.winner = winnerId;
      tournament.completedAt = new Date().toISOString();
      const player = tournament.players.find(p => p.id === winnerId);
      tournament.champion = player
        ? { playerId: player.id, displayName: player.displayName }
        : null;
    }
  }

  // Schedule the DO alarm at the earliest pending deadline across all in_progress matches.
  _scheduleNextAlarm(tournament) {
    const now = Date.now();
    let earliest = null;

    for (const match of tournament.matches) {
      if (match.status !== 'in_progress') continue;

      if (match.joinDeadline && match.joinDeadline > now) {
        if (!earliest || match.joinDeadline < earliest) earliest = match.joinDeadline;
      }
      if (match.heartbeats) {
        for (const ts of Object.values(match.heartbeats)) {
          const expiry = ts + 30_000;
          if (expiry > now && (!earliest || expiry < earliest)) earliest = expiry;
        }
      }
    }

    if (earliest) {
      this.state.storage.setAlarm(earliest).catch(() => {});
    }
  }

  async _mirrorToKV(tournament) {
    if (this.env.TOURNAMENTS_KV) {
      await this.env.TOURNAMENTS_KV.put(
        `tournament:${tournament.id}`,
        JSON.stringify(tournament),
        { expirationTtl: 60 * 60 * 24 * 90 }, // 90-day history
      );
    }
  }

  _doResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Tournament Bracket Builder ────────────────────────────────────────────────

/**
 * Build an 8-player single-elimination bracket seeded by battle rating.
 *
 * Seeding (highest vs lowest, snake pairing):
 *   QF0: seed 1 vs seed 8  →  SF0 slot 1
 *   QF1: seed 4 vs seed 5  →  SF0 slot 2
 *   QF2: seed 2 vs seed 7  →  SF1 slot 1
 *   QF3: seed 3 vs seed 6  →  SF1 slot 2
 *   SF0: QF0 winner vs QF1 winner  →  Final slot 1
 *   SF1: QF2 winner vs QF3 winner  →  Final slot 2
 *
 * Null player slots = bye (auto-complete, winner = the non-null player).
 */
function _buildTournament(id, players) {
  const seeded = [...players]
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .map((p, i) => ({ ...p, seed: i + 1 }));

  // Pad to 8 with byes (null)
  while (seeded.length < 8) seeded.push(null);

  // QF pairings: [index into seeded for p1, index for p2]
  const qfPairings = [
    [0, 7], // seed 1 vs 8
    [3, 4], // seed 4 vs 5
    [1, 6], // seed 2 vs 7
    [2, 5], // seed 3 vs 6
  ];

  // Pre-generate all match IDs so QF matches can reference their SF parents
  const ids = Array.from({ length: 7 }, () =>
    crypto.randomUUID().replace(/-/g, '').slice(0, 16),
  );
  // ids[0..3] = QF0–QF3, ids[4..5] = SF0–SF1, ids[6] = Final

  const matches = [];

  // QF matches
  for (let i = 0; i < 4; i++) {
    const [aIdx, bIdx] = qfPairings[i];
    const p1 = seeded[aIdx];
    const p2 = seeded[bIdx];
    const isBye = !p1 || !p2;
    const winnerId = isBye ? (p1 ? p1.id : p2 ? p2.id : null) : null;
    const sfId = ids[i < 2 ? 4 : 5];
    const nextMatchSlot = i % 2 === 0 ? 1 : 2;
    const qfStatus = isBye ? 'complete' : 'in_progress';

    matches.push({
      id: ids[i],
      round: 0,
      matchIndex: i,
      status: qfStatus,
      player1Id: p1 ? p1.id : null,
      player2Id: p2 ? p2.id : null,
      winnerId,
      isBye,
      nextMatchId: sfId,
      nextMatchSlot,
      joinDeadline: qfStatus === 'in_progress' ? Date.now() + 60_000 : null,
      joinedPlayerIds: [],
      heartbeats: {},
      forfeitReason: null,
    });
  }

  // SF matches — seed with bye-resolved winners
  for (let i = 0; i < 2; i++) {
    const qf1 = matches[i * 2];
    const qf2 = matches[i * 2 + 1];
    const p1Id = qf1.winnerId || null;
    const p2Id = qf2.winnerId || null;
    const sfStatus = p1Id && p2Id ? 'in_progress' : 'pending';

    matches.push({
      id: ids[4 + i],
      round: 1,
      matchIndex: i,
      status: sfStatus,
      player1Id: p1Id,
      player2Id: p2Id,
      winnerId: null,
      isBye: false,
      nextMatchId: ids[6],
      nextMatchSlot: i + 1,
      joinDeadline: sfStatus === 'in_progress' ? Date.now() + 60_000 : null,
      joinedPlayerIds: [],
      heartbeats: {},
      forfeitReason: null,
    });
  }

  // Final
  const sf0 = matches[4];
  const sf1 = matches[5];
  const fp1 = sf0.status === 'complete' ? sf0.winnerId : null;
  const fp2 = sf1.status === 'complete' ? sf1.winnerId : null;

  const finalStatus = fp1 && fp2 ? 'in_progress' : 'pending';
  matches.push({
    id: ids[6],
    round: 2,
    matchIndex: 0,
    status: finalStatus,
    player1Id: fp1,
    player2Id: fp2,
    winnerId: null,
    isBye: false,
    nextMatchId: null,
    nextMatchSlot: null,
    joinDeadline: finalStatus === 'in_progress' ? Date.now() + 60_000 : null,
    joinedPlayerIds: [],
    heartbeats: {},
    forfeitReason: null,
  });

  return {
    id,
    status: 'in_progress',
    createdAt: new Date().toISOString(),
    completedAt: null,
    players: seeded.filter(Boolean),
    matches,
    winner: null,
    champion: null,
  };
}

// ── Tournament API Handlers ───────────────────────────────────────────────────

/**
 * POST /api/tournaments
 * Body: { players: [{ id, displayName, rating }] }
 * Creates a tournament, seeds the bracket, returns full tournament object.
 */
async function handlePostTournament(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { players } = body;
  if (!Array.isArray(players) || players.length < 2 || players.length > 8) {
    return jsonResponse({ error: 'players must be an array of 2–8 entries' }, 400);
  }

  for (const p of players) {
    if (!p || typeof p.id !== 'string' || !p.id.trim()) {
      return jsonResponse({ error: 'Each player must have a non-empty string id' }, 400);
    }
    if (typeof p.displayName !== 'string' || !DISPLAY_NAME_REGEX.test(p.displayName)) {
      return jsonResponse({ error: `Invalid displayName: ${p.displayName}` }, 400);
    }
    if (typeof p.rating !== 'number') {
      return jsonResponse({ error: `Player ${p.id} must have a numeric rating` }, 400);
    }
  }

  if (new Set(players.map(p => p.id)).size !== players.length) {
    return jsonResponse({ error: 'Duplicate player ids' }, 400);
  }

  const tournamentId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const doId = env.TOURNAMENT_ROOMS.idFromName(tournamentId);
  const doStub = env.TOURNAMENT_ROOMS.get(doId);

  const doRes = await doStub.fetch('http://internal/init', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: tournamentId, players }),
  });

  const data = await doRes.json();
  return jsonResponse(data, doRes.status === 201 ? 201 : 200);
}

/**
 * GET /api/tournaments/:id
 * Returns full bracket with match states.
 */
async function handleGetTournament(tournamentId, env) {
  const doId = env.TOURNAMENT_ROOMS.idFromName(tournamentId);
  const doStub = env.TOURNAMENT_ROOMS.get(doId);
  const doRes = await doStub.fetch('http://internal/', { method: 'GET' });
  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

/**
 * POST /api/tournaments/:id/match-complete
 * Body: { matchId, winnerId }
 * Internal endpoint: called when a match concludes. Advances the bracket.
 */
async function handlePostMatchComplete(tournamentId, request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { matchId, winnerId } = body;
  if (!matchId || !winnerId) {
    return jsonResponse({ error: 'matchId and winnerId are required' }, 400);
  }

  const doId = env.TOURNAMENT_ROOMS.idFromName(tournamentId);
  const doStub = env.TOURNAMENT_ROOMS.get(doId);

  const doRes = await doStub.fetch('http://internal/match-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, winnerId }),
  });

  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

/**
 * POST /api/tournaments/:id/match-join
 * Body: { matchId, playerId }
 * Player signals readiness within the 60-second join window. Starts heartbeat tracking.
 */
async function handlePostMatchJoin(tournamentId, request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { matchId, playerId } = body;
  if (!matchId || !playerId) {
    return jsonResponse({ error: 'matchId and playerId are required' }, 400);
  }

  const doId = env.TOURNAMENT_ROOMS.idFromName(tournamentId);
  const doStub = env.TOURNAMENT_ROOMS.get(doId);
  const doRes = await doStub.fetch('http://internal/match-join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, playerId }),
  });

  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

/**
 * POST /api/tournaments/:id/match-heartbeat
 * Body: { matchId, playerId }
 * Player liveness signal. Must be called every ≤ 20s during a match to avoid
 * the 30-second disconnect forfeit threshold.
 */
async function handlePostMatchHeartbeat(tournamentId, request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { matchId, playerId } = body;
  if (!matchId || !playerId) {
    return jsonResponse({ error: 'matchId and playerId are required' }, 400);
  }

  const doId = env.TOURNAMENT_ROOMS.idFromName(tournamentId);
  const doStub = env.TOURNAMENT_ROOMS.get(doId);
  const doRes = await doStub.fetch('http://internal/match-heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, playerId }),
  });

  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

// ── Router ────────────────────────────────────────────────────────────────────

// ── Guild Data Model ──────────────────────────────────────────────────────────

const GUILD_TAG_REGEX = /^[A-Z0-9]{3,5}$/;
const GUILD_NAME_MAX = 32;
const GUILD_DESC_MAX = 256;
const GUILD_MEMBERS_MAX = 30;
const GUILD_LEVEL_MAX = 20;
const GUILD_XP_LOG_MAX = 200;

// Valid XP event sources and their amounts
const GUILD_XP_SOURCES = {
  standard_match_win:   10,
  tournament_match_win: 25,
  clan_war_win:         50,
  daily_mission:         5,
};

// Cumulative XP needed to reach a given level (level >= 1).
// XP to go from level N to N+1 = N^2 * 500 (quadratic curve).
function _guildXpThreshold(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += i * i * 500;
  return total;
}

/**
 * Returns ISO week string "YYYY-Www" for a given Date (UTC).
 */
function _isoWeekStr(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * GuildObject — Durable Object storing a single guild's state.
 *
 * Storage keys:
 *   guild               → { id, name, tag, description, emblem, bannerColor, activeBoardSkin,
 *                           level, xp, memberCount, guildRating, isPrivate, createdAt,
 *                           lastWeekKey, lastWeekSnapshot }
 *   members             → { [userId]: { userId, role, contributionXP, weeklyContributionXP, joinedAt } }
 *   joinRequests        → { [userId]: { userId, requestedAt } }
 *   weeklyNotifications → { [userId]: { rank, totalMembers, guildName, weeklyXP, week } }
 *
 * Internal routes (called by API handlers via DO stub):
 *   PUT    /init                  { guild, ownerId }
 *   GET    /
 *   PATCH  /update                { userId, name?, description?, emblem?, bannerColor?, isPrivate?, activeBoardSkin? }
 *   DELETE /disband               { userId }
 *   POST   /join                  { userId }
 *   POST   /leave                 { userId }
 *   POST   /kick                  { actorId, targetUserId }
 *   GET    /join-requests
 *   POST   /join-request          { userId }
 *   DELETE /join-request          { userId }
 *   GET    /leaderboard           ?period=weekly
 *   GET    /weekly-notification   ?userId=X
 */
export class GuildObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'PUT' && url.pathname === '/init') {
      return this._init(await request.json());
    } else if (method === 'GET' && url.pathname === '/') {
      return this._get();
    } else if (method === 'PATCH' && url.pathname === '/update') {
      return this._update(await request.json());
    } else if (method === 'DELETE' && url.pathname === '/disband') {
      return this._disband(await request.json());
    } else if (method === 'POST' && url.pathname === '/join') {
      return this._join(await request.json());
    } else if (method === 'POST' && url.pathname === '/leave') {
      return this._leave(await request.json());
    } else if (method === 'POST' && url.pathname === '/kick') {
      return this._kick(await request.json());
    } else if (method === 'GET' && url.pathname === '/join-requests') {
      return this._getJoinRequests();
    } else if (method === 'POST' && url.pathname === '/join-request') {
      return this._addJoinRequest(await request.json());
    } else if (method === 'DELETE' && url.pathname === '/join-request') {
      return this._removeJoinRequest(await request.json());
    } else if (method === 'POST' && url.pathname === '/promote') {
      return this._promoteOrDemote(await request.json());
    } else if (method === 'POST' && url.pathname === '/xp') {
      return this._addXP(await request.json());
    } else if (method === 'GET' && url.pathname === '/xp-log') {
      return this._getXpLog(url);
    } else if (method === 'GET' && url.pathname === '/leaderboard') {
      return this._getLeaderboard(url);
    } else if (method === 'GET' && url.pathname === '/weekly-notification') {
      return this._getWeeklyNotification(url);
    }
    return this._res({ error: 'Not found' }, 404);
  }

  async _init({ guild, ownerId }) {
    const existing = await this.state.storage.get('guild');
    if (existing) return this._res({ guild: existing, members: Object.values(await this.state.storage.get('members') || {}) }, 200);

    await this.state.storage.put('guild', guild);
    const members = {
      [ownerId]: { userId: ownerId, role: 'owner', contributionXP: 0, joinedAt: guild.createdAt },
    };
    await this.state.storage.put('members', members);
    return this._res({ guild, members: Object.values(members) }, 201);
  }

  async _get() {
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    const members = await this.state.storage.get('members') || {};
    return this._res({ guild, members: Object.values(members) });
  }

  async _update({ userId, name, description, emblem, bannerColor, isPrivate, activeBoardSkin }) {
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    const members = await this.state.storage.get('members') || {};
    const member = members[userId];
    if (!member) return this._res({ error: 'Not a guild member' }, 403);
    if (member.role !== 'owner' && member.role !== 'officer') {
      return this._res({ error: 'Only owner or officer can update guild' }, 403);
    }
    if (name !== undefined) guild.name = name;
    if (description !== undefined) guild.description = description;
    if (emblem !== undefined) guild.emblem = emblem;
    if (bannerColor !== undefined) guild.bannerColor = bannerColor;
    if (isPrivate !== undefined) guild.isPrivate = !!isPrivate;
    if (activeBoardSkin !== undefined) {
      const SKIN_LEVEL_REQ = { stone_brick: 10, nether_brick: 15 };
      if (activeBoardSkin !== null && activeBoardSkin !== 'none' && !SKIN_LEVEL_REQ[activeBoardSkin]) {
        return this._res({ error: 'Invalid board skin' }, 400);
      }
      const skinLevel = SKIN_LEVEL_REQ[activeBoardSkin] || 0;
      if (skinLevel > 0 && (guild.level || 1) < skinLevel) {
        return this._res({ error: `Guild must be level ${skinLevel} to use this board skin` }, 403);
      }
      guild.activeBoardSkin = (activeBoardSkin === 'none' || activeBoardSkin === null) ? null : activeBoardSkin;
    }
    await this.state.storage.put('guild', guild);
    return this._res({ guild, members: Object.values(members) });
  }

  async _join({ userId }) {
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    const members = await this.state.storage.get('members') || {};
    if (members[userId]) return this._res({ error: 'Already a member' }, 409);
    if (guild.memberCount >= GUILD_MEMBERS_MAX) return this._res({ error: 'Guild is full' }, 409);
    members[userId] = { userId, role: 'member', contributionXP: 0, joinedAt: new Date().toISOString() };
    guild.memberCount = Object.keys(members).length;
    await this.state.storage.put('guild', guild);
    await this.state.storage.put('members', members);
    return this._res({ guild, members: Object.values(members) });
  }

  async _leave({ userId }) {
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    const members = await this.state.storage.get('members') || {};
    if (!members[userId]) return this._res({ error: 'Not a member' }, 404);

    const isOwner = members[userId].role === 'owner';
    delete members[userId];
    const remaining = Object.keys(members);

    if (remaining.length === 0) {
      // Last member left — disband
      const tag = guild.tag;
      const guildId = guild.id;
      await this.state.storage.deleteAll();
      return this._res({ left: true, disbanded: true, guildId, tag, memberIds: [] });
    }

    if (isOwner) {
      // Transfer to longest-serving officer, else longest-serving member
      const sorted = remaining
        .map(id => members[id])
        .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
      const nextOwner = sorted.find(m => m.role === 'officer') || sorted[0];
      members[nextOwner.userId].role = 'owner';
    }

    guild.memberCount = remaining.length;
    await this.state.storage.put('guild', guild);
    await this.state.storage.put('members', members);
    return this._res({ left: true, guild, members: Object.values(members) });
  }

  async _kick({ actorId, targetUserId }) {
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    const members = await this.state.storage.get('members') || {};
    const actor = members[actorId];
    const target = members[targetUserId];
    if (!actor) return this._res({ error: 'Not a guild member' }, 403);
    if (!target) return this._res({ error: 'Target is not a member' }, 404);
    if (actor.role === 'member') return this._res({ error: 'Insufficient permissions' }, 403);
    if (actor.role === 'officer' && target.role !== 'member') {
      return this._res({ error: 'Officers can only kick members' }, 403);
    }
    if (target.role === 'owner') return this._res({ error: 'Cannot kick the owner' }, 403);
    delete members[targetUserId];
    guild.memberCount = Object.keys(members).length;
    await this.state.storage.put('guild', guild);
    await this.state.storage.put('members', members);
    return this._res({ kicked: true, guild, members: Object.values(members) });
  }

  async _getJoinRequests() {
    const requests = await this.state.storage.get('joinRequests') || {};
    return this._res(Object.values(requests));
  }

  async _addJoinRequest({ userId }) {
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    if (guild.isPrivate) return this._res({ error: 'This guild only accepts direct invites' }, 403);
    const members = await this.state.storage.get('members') || {};
    if (members[userId]) return this._res({ error: 'Already a member' }, 409);
    if (guild.memberCount >= GUILD_MEMBERS_MAX) return this._res({ error: 'Guild is full' }, 409);
    const requests = await this.state.storage.get('joinRequests') || {};
    if (requests[userId]) return this._res({ error: 'Request already pending' }, 409);
    requests[userId] = { userId, requestedAt: new Date().toISOString() };
    await this.state.storage.put('joinRequests', requests);
    return this._res({ requested: true });
  }

  async _removeJoinRequest({ userId }) {
    const requests = await this.state.storage.get('joinRequests') || {};
    delete requests[userId];
    await this.state.storage.put('joinRequests', requests);
    return this._res({ removed: true });
  }

  async _promoteOrDemote({ actorId, targetUserId, newRole }) {
    if (!['owner', 'officer', 'member'].includes(newRole)) {
      return this._res({ error: 'Invalid role. Must be owner, officer, or member' }, 400);
    }
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    const members = await this.state.storage.get('members') || {};
    const actor = members[actorId];
    const target = members[targetUserId];
    if (!actor) return this._res({ error: 'Not a guild member' }, 403);
    if (!target) return this._res({ error: 'Target is not a member' }, 404);
    if (actor.role !== 'owner') return this._res({ error: 'Only the owner can change member roles' }, 403);
    if (targetUserId === actorId) return this._res({ error: 'Cannot change your own role' }, 400);
    if (target.role === 'owner') return this._res({ error: 'Cannot change the owner\'s role directly; transfer ownership instead' }, 400);
    if (newRole === 'owner') {
      // Ownership transfer: current owner becomes officer
      members[actorId].role = 'officer';
      members[targetUserId].role = 'owner';
    } else {
      members[targetUserId].role = newRole;
    }
    await this.state.storage.put('members', members);
    return this._res({ guild, members: Object.values(members) });
  }

  async _addXP({ userId, amount, source }) {
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    const members = await this.state.storage.get('members') || {};

    const xpAmount = Math.max(0, Math.floor(Number(amount) || 0));
    if (xpAmount === 0) return this._res({ guild, members: Object.values(members), xpAwarded: 0, leveled: false });

    // ── Weekly reset check ────────────────────────────────────────────────────
    const currentWeek = _isoWeekStr();
    if (guild.lastWeekKey && guild.lastWeekKey !== currentWeek) {
      // Save snapshot of top-3 from the just-ended week
      const sorted = Object.values(members)
        .sort((a, b) => (b.weeklyContributionXP || 0) - (a.weeklyContributionXP || 0));
      guild.lastWeekSnapshot = {
        week: guild.lastWeekKey,
        top3: sorted.slice(0, 3).map((m, i) => ({
          rank: i + 1,
          userId: m.userId,
          role: m.role,
          weeklyXP: m.weeklyContributionXP || 0,
        })),
      };
      // Build weekly summary notifications for each member
      const totalMembers = sorted.length;
      const notifications = {};
      sorted.forEach((m, i) => {
        notifications[m.userId] = {
          rank: i + 1,
          totalMembers,
          guildName: guild.name,
          weeklyXP: m.weeklyContributionXP || 0,
          week: guild.lastWeekKey,
        };
      });
      await this.state.storage.put('weeklyNotifications', notifications);
      // Reset weekly XP for all members
      for (const uid of Object.keys(members)) {
        members[uid].weeklyContributionXP = 0;
      }
    }
    if (!guild.lastWeekKey || guild.lastWeekKey !== currentWeek) {
      guild.lastWeekKey = currentWeek;
    }

    // Credit guild total XP
    guild.xp = (guild.xp || 0) + xpAmount;

    // Credit member contribution
    if (userId && members[userId]) {
      members[userId].contributionXP = (members[userId].contributionXP || 0) + xpAmount;
      members[userId].weeklyContributionXP = (members[userId].weeklyContributionXP || 0) + xpAmount;
    }

    // Level-up check (quadratic curve, cap at 20)
    let leveled = false;
    while (guild.level < GUILD_LEVEL_MAX) {
      const threshold = _guildXpThreshold(guild.level + 1);
      if (guild.xp >= threshold) {
        guild.level++;
        leveled = true;
      } else {
        break;
      }
    }

    // Append to XP event log (newest first, capped)
    const log = (await this.state.storage.get('xpLog')) || [];
    log.unshift({
      id: crypto.randomUUID(),
      userId: userId || null,
      amount: xpAmount,
      source: source || 'unknown',
      guildXPAfter: guild.xp,
      guildLevelAfter: guild.level,
      ts: new Date().toISOString(),
    });
    if (log.length > GUILD_XP_LOG_MAX) log.length = GUILD_XP_LOG_MAX;

    await Promise.all([
      this.state.storage.put('guild', guild),
      this.state.storage.put('members', members),
      this.state.storage.put('xpLog', log),
    ]);

    return this._res({ guild, members: Object.values(members), xpAwarded: xpAmount, leveled });
  }

  async _getXpLog(url) {
    const log = (await this.state.storage.get('xpLog')) || [];
    const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '50', 10));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
    const page = log.slice(offset, offset + limit);
    return this._res({ log: page, total: log.length, offset, limit });
  }

  async _getLeaderboard() {
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    const members = await this.state.storage.get('members') || {};

    const sorted = Object.values(members)
      .sort((a, b) => (b.weeklyContributionXP || 0) - (a.weeklyContributionXP || 0));

    const leaderboard = sorted.map((m, i) => ({
      rank: i + 1,
      userId: m.userId,
      role: m.role,
      weeklyXP: m.weeklyContributionXP || 0,
      totalXP: m.contributionXP || 0,
    }));

    return this._res({
      leaderboard,
      lastWeekSnapshot: guild.lastWeekSnapshot || null,
      week: guild.lastWeekKey || _isoWeekStr(),
    });
  }

  async _getWeeklyNotification(url) {
    const userId = url.searchParams.get('userId');
    if (!userId) return this._res({ error: 'userId is required' }, 400);

    const notifications = await this.state.storage.get('weeklyNotifications') || {};
    const notification = notifications[userId] || null;

    if (notification) {
      delete notifications[userId];
      await this.state.storage.put('weeklyNotifications', notifications);
    }

    return this._res({ notification });
  }

  async _disband({ userId }) {
    const guild = await this.state.storage.get('guild');
    if (!guild) return this._res({ error: 'Guild not found' }, 404);
    const members = await this.state.storage.get('members') || {};
    const member = members[userId];
    if (!member || member.role !== 'owner') {
      return this._res({ error: 'Only the guild owner can disband' }, 403);
    }
    const memberIds = Object.keys(members);
    const tag = guild.tag;
    await this.state.storage.deleteAll();
    return this._res({ disbanded: true, guildId: guild.id, memberIds, tag });
  }

  _res(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Clan War Constants ────────────────────────────────────────────────────────

const WAR_ROSTER_SIZE = 5;
const WAR_MAX_ADVANCE_DAYS = 7;
const WAR_NOMINATION_CLOSE_BEFORE_MS = 60 * 60 * 1000; // 1 hour before start
const WAR_WINDOW_DURATION_MS = 45 * 60 * 1000;          // 45-minute window
const WAR_FORFEIT_DELAY_MS   = 2 * 60 * 1000;           // 2 min online-check grace

/**
 * Validates a proposed war window start time.
 * Returns an error string, or null if valid.
 */
function _validateWarWindow(date) {
  if (isNaN(date.getTime())) return 'Invalid date format';
  const now = new Date();
  const maxFuture = new Date(now.getTime() + WAR_MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000);
  if (date <= now) return 'War window must be in the future';
  if (date > maxFuture) return `War can only be scheduled up to ${WAR_MAX_ADVANCE_DAYS} days in advance`;
  const mins = date.getUTCMinutes();
  const secs = date.getUTCSeconds();
  const ms   = date.getUTCMilliseconds();
  if ((mins !== 0 && mins !== 30) || secs !== 0 || ms !== 0) {
    return 'War window must start on the hour or half-hour (e.g. 14:00 or 14:30 UTC)';
  }
  return null;
}

function _getClanWarStub(warId, env) {
  return env.CLAN_WAR_OBJECTS.get(env.CLAN_WAR_OBJECTS.idFromName(warId));
}

/**
 * Aggregate slot results to determine war winner.
 * Returns { challengerWins, defenderWins, pending, winner: 'challenger'|'defender'|'draw'|null }
 */
function _aggregateWarSlots(slots) {
  let cWins = 0, dWins = 0, pending = 0;
  for (const slot of slots) {
    if (slot.status === 'done' || slot.status === 'forfeited') {
      if (slot.result === 'challenger_win') cWins++;
      else if (slot.result === 'defender_win') dWins++;
    } else {
      pending++;
    }
  }
  // Decide winner when 3+ wins secured or no slots remain
  let winner = null;
  if (cWins >= 3) winner = 'challenger';
  else if (dWins >= 3) winner = 'defender';
  else if (pending === 0) winner = cWins > dWins ? 'challenger' : dWins > cWins ? 'defender' : 'draw';
  return { challengerWins: cWins, defenderWins: dWins, pending, winner };
}

/**
 * ClanWarObject — Durable Object storing a single clan war's state.
 *
 * Storage keys:
 *   war              → { id, challengerGuildId, challengerGuildName, challengerGuildTag,
 *                        challengerGuildEmblem, defenderGuildId, defenderGuildName,
 *                        defenderGuildTag, defenderGuildEmblem, proposedWindowStart,
 *                        windowStart, lastProposerId, status, format, challengedAt,
 *                        scheduledAt, completedAt, winner }
 *   roster:{guildId} → [userId, ...]   (max WAR_ROSTER_SIZE per guild)
 *   slots            → [{ slotIndex, challengerUserId, defenderUserId, status, result,
 *                          battleRoomCode, startedAt, completedAt }, ...]
 *
 * Statuses: pending_acceptance → scheduled → roster_open → roster_locked → in_progress → completed
 *           (pending_acceptance can also → cancelled via decline)
 *
 * Internal routes:
 *   PUT    /init                      { war }
 *   GET    /
 *   POST   /respond                   { actorGuildId, action: 'accept'|'counter'|'decline', counterWindowStart? }
 *   POST   /nominate                  { actorGuildId, userId }
 *   DELETE /nominate                  { actorGuildId, userId }
 *   POST   /tick                      — advance state machine based on current time
 *   POST   /complete                  { winnerGuildId }
 *   GET    /slots                     — return slot array
 *   POST   /slots/:index/room         { battleRoomCode? } — get/register battle room for slot
 *   POST   /slots/:index/result       { result } — report match outcome
 *   POST   /slots/:index/forfeit      { actorId } — forfeit a slot
 */
export class ClanWarObject {
  constructor(state, env) {
    this.state = state;
    this.env   = env;
  }

  async fetch(request) {
    const url    = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'PUT'    && url.pathname === '/init')     return this._init(await request.json());
    if (method === 'GET'    && url.pathname === '/')         return this._get();
    if (method === 'POST'   && url.pathname === '/respond')  return this._respond(await request.json());
    if (method === 'POST'   && url.pathname === '/nominate') return this._nominate(await request.json());
    if (method === 'DELETE' && url.pathname === '/nominate') return this._removeNomination(await request.json());
    if (method === 'POST'   && url.pathname === '/tick')     return this._tick();
    if (method === 'POST'   && url.pathname === '/complete') return this._complete(await request.json());
    // Slot management
    if (method === 'GET'    && url.pathname === '/slots')    return this._getSlots();
    const slotMatch = url.pathname.match(/^\/slots\/(\d+)\/(room|result|forfeit)$/);
    if (slotMatch) {
      const slotIndex = parseInt(slotMatch[1], 10);
      const body = method === 'POST' ? await request.json() : {};
      if (slotMatch[2] === 'room')    return this._slotRoom(slotIndex, body);
      if (slotMatch[2] === 'result')  return this._slotResult(slotIndex, body);
      if (slotMatch[2] === 'forfeit') return this._slotForfeit(slotIndex, body);
    }
    return this._res({ error: 'Not found' }, 404);
  }

  async _init({ war }) {
    await this.state.storage.put('war', war);
    return this._res({ war }, 201);
  }

  async _get() {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    const rosters = await this._getRosters(war);
    return this._res({ war, rosters });
  }

  async _respond({ actorGuildId, action, counterWindowStart }) {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    if (war.status !== 'pending_acceptance') {
      return this._res({ error: 'War is not awaiting a response' }, 409);
    }

    // Accept / counter can come from whichever guild did NOT last propose
    // (challenger sends initial, defender responds — on counter, roles swap)
    const expectedResponder = war.lastProposerId === war.challengerGuildId
      ? war.defenderGuildId
      : war.challengerGuildId;
    if (actorGuildId !== expectedResponder) {
      return this._res({ error: 'It is not your turn to respond to this challenge' }, 403);
    }

    if (action === 'decline') {
      war.status = 'cancelled';
      war.completedAt = new Date().toISOString();
      await this.state.storage.put('war', war);
      return this._res({ war, rosters: await this._getRosters(war) });
    }

    if (action === 'counter') {
      if (!counterWindowStart) return this._res({ error: 'counterWindowStart required for counter' }, 400);
      const ws  = new Date(counterWindowStart);
      const err = _validateWarWindow(ws);
      if (err) return this._res({ error: err }, 400);
      war.proposedWindowStart = counterWindowStart;
      war.lastProposerId = actorGuildId;
      await this.state.storage.put('war', war);
      return this._res({ war, rosters: await this._getRosters(war) });
    }

    if (action === 'accept') {
      war.windowStart  = war.proposedWindowStart;
      war.scheduledAt  = new Date().toISOString();
      war.status       = 'roster_open';
      await this.state.storage.put('war', war);
      return this._res({ war, rosters: await this._getRosters(war) });
    }

    return this._res({ error: "action must be 'accept', 'counter', or 'decline'" }, 400);
  }

  async _nominate({ actorGuildId, userId }) {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    if (war.status !== 'roster_open') {
      return this._res({ error: 'Roster nominations are not open' }, 409);
    }
    const warStart = new Date(war.windowStart);
    if (Date.now() >= warStart.getTime() - WAR_NOMINATION_CLOSE_BEFORE_MS) {
      return this._res({ error: 'Nomination window has closed (1 hour before war start)' }, 409);
    }
    if (actorGuildId !== war.challengerGuildId && actorGuildId !== war.defenderGuildId) {
      return this._res({ error: 'Guild is not a war participant' }, 403);
    }
    const rosterKey = `roster:${actorGuildId}`;
    const roster    = (await this.state.storage.get(rosterKey)) || [];
    if (roster.includes(userId))         return this._res({ error: 'Player already nominated' }, 409);
    if (roster.length >= WAR_ROSTER_SIZE) return this._res({ error: `Roster is full (max ${WAR_ROSTER_SIZE})` }, 409);
    roster.push(userId);
    await this.state.storage.put(rosterKey, roster);
    return this._res({ war, rosters: await this._getRosters(war) });
  }

  async _removeNomination({ actorGuildId, userId }) {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    if (war.status !== 'roster_open') return this._res({ error: 'Roster nominations are not open' }, 409);
    const warStart = new Date(war.windowStart);
    if (Date.now() >= warStart.getTime() - WAR_NOMINATION_CLOSE_BEFORE_MS) {
      return this._res({ error: 'Nomination window has closed' }, 409);
    }
    const rosterKey = `roster:${actorGuildId}`;
    const roster    = (await this.state.storage.get(rosterKey)) || [];
    const idx = roster.indexOf(userId);
    if (idx === -1) return this._res({ error: 'Player not in roster' }, 404);
    roster.splice(idx, 1);
    await this.state.storage.put(rosterKey, roster);
    return this._res({ war, rosters: await this._getRosters(war) });
  }

  async _tick() {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    const now      = Date.now();
    const warStart = war.windowStart ? new Date(war.windowStart).getTime() : null;
    const warEnd   = warStart ? warStart + WAR_WINDOW_DURATION_MS : null;
    let changed    = false;

    if (war.status === 'roster_open' && warStart) {
      if (now >= warStart - WAR_NOMINATION_CLOSE_BEFORE_MS) {
        war.status = 'roster_locked';
        changed = true;
      }
    }
    if (war.status === 'roster_locked' && warStart) {
      if (now >= warStart) {
        war.status = 'in_progress';
        changed = true;
        // Initialise the 5 slot records from the locked rosters
        await this._initSlots(war);
      }
    }
    if (war.status === 'in_progress' && warEnd) {
      if (now >= warEnd) {
        war.status = 'completed';
        changed = true;
      }
    }
    if (changed) await this.state.storage.put('war', war);
    return this._res({ war, rosters: await this._getRosters(war), changed });
  }

  async _complete({ winnerGuildId }) {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    if (war.status !== 'in_progress' && war.status !== 'roster_locked') {
      return this._res({ error: 'War is not in progress' }, 409);
    }
    if (winnerGuildId !== war.challengerGuildId &&
        winnerGuildId !== war.defenderGuildId   &&
        winnerGuildId !== 'draw') {
      return this._res({ error: 'winnerGuildId must be challengerGuildId, defenderGuildId, or "draw"' }, 400);
    }
    war.status      = 'completed';
    war.winner      = winnerGuildId;
    war.completedAt = new Date().toISOString();
    await this.state.storage.put('war', war);
    return this._res({ war, rosters: await this._getRosters(war) });
  }

  // ── Slot helpers ─────────────────────────────────────────────────────────────

  /** Initialise 5 slot records from the locked rosters, called at in_progress transition. */
  async _initSlots(war) {
    const rosters = await this._getRosters(war);
    const cRoster = rosters[war.challengerGuildId] || [];
    const dRoster = rosters[war.defenderGuildId]   || [];
    const slots = Array.from({ length: WAR_ROSTER_SIZE }, (_, i) => ({
      slotIndex:         i,
      challengerUserId:  cRoster[i] || null,
      defenderUserId:    dRoster[i]   || null,
      status:            'waiting',  // waiting | in_progress | done | forfeited
      result:            null,       // challenger_win | defender_win | draw
      battleRoomCode:    null,
      startedAt:         null,
      completedAt:       null,
    }));
    await this.state.storage.put('slots', slots);
    return slots;
  }

  async _getSlots() {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    if (war.status !== 'in_progress' && war.status !== 'completed') {
      return this._res({ slots: [] });
    }
    let slots = await this.state.storage.get('slots');
    if (!slots) slots = await this._initSlots(war);
    return this._res({ slots });
  }

  /** POST /slots/:slotIndex/room — register or fetch battle room code for a slot. */
  async _slotRoom(slotIndex, { battleRoomCode }) {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    if (war.status !== 'in_progress') return this._res({ error: 'War is not in progress' }, 409);
    let slots = await this.state.storage.get('slots');
    if (!slots) slots = await this._initSlots(war);
    if (slotIndex < 0 || slotIndex >= slots.length) return this._res({ error: 'Invalid slot index' }, 400);
    const slot = slots[slotIndex];
    if (slot.status === 'forfeited') return this._res({ error: 'Slot is forfeited' }, 409);
    if (slot.status === 'done')      return this._res({ error: 'Slot already completed' }, 409);

    if (slot.battleRoomCode) {
      // Room already created — return it (second player will join)
      return this._res({ battleRoomCode: slot.battleRoomCode, role: 'guest', slot });
    }

    if (!battleRoomCode) {
      // First caller: no room yet, tell client to create one
      return this._res({ battleRoomCode: null, role: 'host', slot });
    }

    // First caller is registering the room they created
    slot.battleRoomCode = battleRoomCode;
    slot.status    = 'in_progress';
    slot.startedAt = new Date().toISOString();
    slots[slotIndex] = slot;
    await this.state.storage.put('slots', slots);
    return this._res({ battleRoomCode, role: 'host', slot });
  }

  /** POST /slots/:slotIndex/result — report match outcome. */
  async _slotResult(slotIndex, { result }) {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    if (war.status !== 'in_progress') return this._res({ error: 'War is not in progress' }, 409);
    if (!['challenger_win', 'defender_win', 'draw'].includes(result)) {
      return this._res({ error: 'result must be challenger_win, defender_win, or draw' }, 400);
    }
    let slots = await this.state.storage.get('slots');
    if (!slots) return this._res({ error: 'Slots not initialised' }, 409);
    if (slotIndex < 0 || slotIndex >= slots.length) return this._res({ error: 'Invalid slot index' }, 400);
    const slot = slots[slotIndex];
    if (slot.status === 'done' || slot.status === 'forfeited') {
      return this._res({ slot }); // idempotent
    }
    slot.status      = 'done';
    slot.result      = result;
    slot.completedAt = new Date().toISOString();
    slots[slotIndex] = slot;
    await this.state.storage.put('slots', slots);

    // Check if war is now decided (3+ wins or all slots done)
    const agg = _aggregateWarSlots(slots);
    if (agg.winner) {
      const winnerGuildId = agg.winner === 'draw'        ? 'draw'
                          : agg.winner === 'challenger'  ? war.challengerGuildId
                          :                                war.defenderGuildId;
      war.status      = 'completed';
      war.winner      = winnerGuildId;
      war.completedAt = new Date().toISOString();
      await this.state.storage.put('war', war);
    }
    return this._res({ slot, slots, war });
  }

  /** POST /slots/:slotIndex/forfeit — auto-forfeit a waiting slot. */
  async _slotForfeit(slotIndex, { actorId }) {
    const war = await this.state.storage.get('war');
    if (!war) return this._res({ error: 'War not found' }, 404);
    if (war.status !== 'in_progress') return this._res({ error: 'War is not in progress' }, 409);
    let slots = await this.state.storage.get('slots');
    if (!slots) slots = await this._initSlots(war);
    if (slotIndex < 0 || slotIndex >= slots.length) return this._res({ error: 'Invalid slot index' }, 400);
    const slot = slots[slotIndex];
    if (slot.status === 'done' || slot.status === 'forfeited') return this._res({ slot }); // idempotent

    // Determine forfeit result: whichever side the actor is on loses
    let result;
    if (slot.challengerUserId === actorId) result = 'defender_win';
    else if (slot.defenderUserId === actorId) result = 'challenger_win';
    else {
      // Officer/system forfeit: if both nominated, challenger forfeits; else the empty side loses
      result = !slot.defenderUserId ? 'challenger_win' : 'defender_win';
    }

    slot.status      = 'forfeited';
    slot.result      = result;
    slot.completedAt = new Date().toISOString();
    slots[slotIndex] = slot;
    await this.state.storage.put('slots', slots);

    const agg = _aggregateWarSlots(slots);
    if (agg.winner) {
      const winnerGuildId = agg.winner === 'draw'       ? 'draw'
                          : agg.winner === 'challenger' ? war.challengerGuildId
                          :                               war.defenderGuildId;
      war.status      = 'completed';
      war.winner      = winnerGuildId;
      war.completedAt = new Date().toISOString();
      await this.state.storage.put('war', war);
    }
    return this._res({ slot, slots, war });
  }

  // ── Roster helpers ────────────────────────────────────────────────────────────

  async _getRosters(war) {
    const [cRoster, dRoster] = await Promise.all([
      this.state.storage.get(`roster:${war.challengerGuildId}`),
      this.state.storage.get(`roster:${war.defenderGuildId}`),
    ]);
    return {
      [war.challengerGuildId]: cRoster || [],
      [war.defenderGuildId]:   dRoster || [],
    };
  }

  _res(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Clan War API Handlers ─────────────────────────────────────────────────────

/**
 * POST /api/clan-wars
 * Body: { actorId, challengerGuildId, targetGuildId, proposedWindowStart }
 * Sends a war challenge from challengerGuild to targetGuild.
 */
async function handlePostClanWarChallenge(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { actorId, challengerGuildId, targetGuildId, proposedWindowStart } = body;
  if (!actorId || !challengerGuildId || !targetGuildId || !proposedWindowStart) {
    return jsonResponse({ error: 'actorId, challengerGuildId, targetGuildId, proposedWindowStart are required' }, 400);
  }
  if (challengerGuildId === targetGuildId) {
    return jsonResponse({ error: 'Cannot challenge your own guild' }, 400);
  }

  const ws  = new Date(proposedWindowStart);
  const err = _validateWarWindow(ws);
  if (err) return jsonResponse({ error: err }, 400);

  // Verify actor is officer/owner of challenger guild
  const cStub = env.GUILD_OBJECTS.get(env.GUILD_OBJECTS.idFromName(challengerGuildId));
  const cRes  = await cStub.fetch('http://internal/', { method: 'GET' });
  const cData = await cRes.json();
  if (cRes.status !== 200) return jsonResponse(cData, cRes.status);
  const actor = (cData.members || []).find(m => m.userId === actorId);
  if (!actor) return jsonResponse({ error: 'You are not in this guild' }, 403);
  if (actor.role === 'member') return jsonResponse({ error: 'Only officers and owners can send war challenges' }, 403);

  // Verify defender guild exists
  const dStub = env.GUILD_OBJECTS.get(env.GUILD_OBJECTS.idFromName(targetGuildId));
  const dRes  = await dStub.fetch('http://internal/', { method: 'GET' });
  const dData = await dRes.json();
  if (dRes.status !== 200) return jsonResponse({ error: 'Target guild not found' }, 404);

  // Check neither guild already has an active war
  const [cActive, dActive] = await Promise.all([
    env.GUILDS_KV.get(`guild:active-war:${challengerGuildId}`),
    env.GUILDS_KV.get(`guild:active-war:${targetGuildId}`),
  ]);
  if (cActive) return jsonResponse({ error: 'Your guild already has an active war' }, 409);
  if (dActive) return jsonResponse({ error: 'Target guild already has an active war' }, 409);

  const warId = crypto.randomUUID();
  const now   = new Date().toISOString();
  const war   = {
    id: warId,
    challengerGuildId,
    challengerGuildName:   cData.guild.name,
    challengerGuildTag:    cData.guild.tag,
    challengerGuildEmblem: cData.guild.emblem,
    defenderGuildId:       targetGuildId,
    defenderGuildName:     dData.guild.name,
    defenderGuildTag:      dData.guild.tag,
    defenderGuildEmblem:   dData.guild.emblem,
    proposedWindowStart,
    windowStart:    null,
    lastProposerId: challengerGuildId,
    status:         'pending_acceptance',
    format:         'best-of-5',
    challengedAt:   now,
    scheduledAt:    null,
    completedAt:    null,
    winner:         null,
  };

  const warStub   = _getClanWarStub(warId, env);
  const initRes   = await warStub.fetch('http://internal/init', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ war }),
  });
  if (initRes.status !== 201) return jsonResponse(await initRes.json(), initRes.status);

  const summary = {
    id: warId, challengerGuildId, defenderGuildId: targetGuildId,
    status: 'pending_acceptance', proposedWindowStart, challengedAt: now,
  };
  await Promise.all([
    env.GUILDS_KV.put(`clanwar:${warId}`, JSON.stringify(summary)),
    env.GUILDS_KV.put(`guild:active-war:${challengerGuildId}`, warId),
    env.GUILDS_KV.put(`guild:active-war:${targetGuildId}`, warId),
    env.GUILDS_KV.put(`guild:wars:${challengerGuildId}:${warId}`, warId),
    env.GUILDS_KV.put(`guild:wars:${targetGuildId}:${warId}`, warId),
  ]);

  return jsonResponse({ war }, 201);
}

/**
 * GET /api/clan-wars/:warId
 */
async function handleGetClanWar(warId, env) {
  const res = await _getClanWarStub(warId, env).fetch('http://internal/', { method: 'GET' });
  return jsonResponse(await res.json(), res.status);
}

/**
 * POST /api/clan-wars/:warId/respond
 * Body: { actorId, actorGuildId, action: 'accept'|'counter'|'decline', counterWindowStart? }
 */
async function handleRespondClanWar(warId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { actorId, actorGuildId, action, counterWindowStart } = body;
  if (!actorId || !actorGuildId || !action) {
    return jsonResponse({ error: 'actorId, actorGuildId, action are required' }, 400);
  }
  if (!['accept', 'counter', 'decline'].includes(action)) {
    return jsonResponse({ error: "action must be 'accept', 'counter', or 'decline'" }, 400);
  }

  // Verify actor is officer/owner
  const gStub = env.GUILD_OBJECTS.get(env.GUILD_OBJECTS.idFromName(actorGuildId));
  const gRes  = await gStub.fetch('http://internal/', { method: 'GET' });
  const gData = await gRes.json();
  if (gRes.status !== 200) return jsonResponse(gData, gRes.status);
  const actor = (gData.members || []).find(m => m.userId === actorId);
  if (!actor) return jsonResponse({ error: 'You are not in this guild' }, 403);
  if (actor.role === 'member') return jsonResponse({ error: 'Only officers and owners can respond to war challenges' }, 403);

  if (action === 'counter' && counterWindowStart) {
    const err = _validateWarWindow(new Date(counterWindowStart));
    if (err) return jsonResponse({ error: err }, 400);
  }

  const warStub = _getClanWarStub(warId, env);
  const res     = await warStub.fetch('http://internal/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorGuildId, action, counterWindowStart }),
  });
  const data = await res.json();

  if (res.status === 200 && data.war) {
    const w = data.war;
    const kvOps = [
      env.GUILDS_KV.put(`clanwar:${warId}`, JSON.stringify({
        id: warId, challengerGuildId: w.challengerGuildId, defenderGuildId: w.defenderGuildId,
        status: w.status, windowStart: w.windowStart, proposedWindowStart: w.proposedWindowStart,
        lastProposerId: w.lastProposerId, challengedAt: w.challengedAt,
      })),
    ];
    if (w.status === 'cancelled') {
      kvOps.push(
        env.GUILDS_KV.delete(`guild:active-war:${w.challengerGuildId}`),
        env.GUILDS_KV.delete(`guild:active-war:${w.defenderGuildId}`),
      );
    }
    await Promise.all(kvOps);
  }

  return jsonResponse(data, res.status);
}

/**
 * POST /api/clan-wars/:warId/nominate
 * Body: { actorId, actorGuildId, nomineeUserId }
 */
async function handleNominateClanWar(warId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { actorId, actorGuildId, nomineeUserId } = body;
  if (!actorId || !actorGuildId || !nomineeUserId) {
    return jsonResponse({ error: 'actorId, actorGuildId, nomineeUserId are required' }, 400);
  }

  const gStub = env.GUILD_OBJECTS.get(env.GUILD_OBJECTS.idFromName(actorGuildId));
  const gRes  = await gStub.fetch('http://internal/', { method: 'GET' });
  const gData = await gRes.json();
  if (gRes.status !== 200) return jsonResponse(gData, gRes.status);
  const actor = (gData.members || []).find(m => m.userId === actorId);
  if (!actor) return jsonResponse({ error: 'You are not in this guild' }, 403);
  if (actor.role === 'member') return jsonResponse({ error: 'Only officers and owners can manage roster nominations' }, 403);
  const nominee = (gData.members || []).find(m => m.userId === nomineeUserId);
  if (!nominee) return jsonResponse({ error: 'Nominee is not a member of your guild' }, 400);

  const res = await _getClanWarStub(warId, env).fetch('http://internal/nominate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorGuildId, userId: nomineeUserId }),
  });
  return jsonResponse(await res.json(), res.status);
}

/**
 * DELETE /api/clan-wars/:warId/nominate/:userId
 * Body: { actorId, actorGuildId }
 */
async function handleRemoveNomination(warId, nomineeUserId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { actorId, actorGuildId } = body;
  if (!actorId || !actorGuildId) return jsonResponse({ error: 'actorId and actorGuildId are required' }, 400);

  const gStub = env.GUILD_OBJECTS.get(env.GUILD_OBJECTS.idFromName(actorGuildId));
  const gRes  = await gStub.fetch('http://internal/', { method: 'GET' });
  const gData = await gRes.json();
  if (gRes.status !== 200) return jsonResponse(gData, gRes.status);
  const actor = (gData.members || []).find(m => m.userId === actorId);
  if (!actor) return jsonResponse({ error: 'You are not in this guild' }, 403);
  if (actor.role === 'member') return jsonResponse({ error: 'Only officers and owners can manage the roster' }, 403);

  const res = await _getClanWarStub(warId, env).fetch('http://internal/nominate', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorGuildId, userId: nomineeUserId }),
  });
  return jsonResponse(await res.json(), res.status);
}

/**
 * GET /api/guilds/:guildId/clan-wars
 * Returns all war summaries for a guild (from KV index).
 */
async function handleGetGuildClanWars(guildId, env) {
  const { keys } = await env.GUILDS_KV.list({ prefix: `guild:wars:${guildId}:` });
  const wars = (await Promise.all(
    keys.map(async k => {
      const warId = k.name.split(':').pop();
      const raw   = await env.GUILDS_KV.get(`clanwar:${warId}`);
      return raw ? JSON.parse(raw) : null;
    })
  )).filter(Boolean);
  return jsonResponse(wars);
}

/**
 * POST /api/clan-wars/:warId/complete
 * Body: { winnerGuildId } — winnerGuildId = challengerGuildId | defenderGuildId | 'draw'
 * Reports the final result and releases active-war locks.
 */
async function handleCompleteClanWar(warId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { winnerGuildId } = body;
  if (!winnerGuildId) return jsonResponse({ error: 'winnerGuildId is required' }, 400);

  const res  = await _getClanWarStub(warId, env).fetch('http://internal/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winnerGuildId }),
  });
  const data = await res.json();

  if (res.status === 200 && data.war) {
    const w = data.war;
    await Promise.all([
      env.GUILDS_KV.delete(`guild:active-war:${w.challengerGuildId}`),
      env.GUILDS_KV.delete(`guild:active-war:${w.defenderGuildId}`),
      env.GUILDS_KV.put(`clanwar:${warId}`, JSON.stringify({
        id: warId, challengerGuildId: w.challengerGuildId, defenderGuildId: w.defenderGuildId,
        status: 'completed', windowStart: w.windowStart, winner: w.winner, completedAt: w.completedAt,
      })),
    ]);

    // Award XP to each winning roster member
    if (w.winner && w.winner !== 'draw') {
      const winnerRoster = (data.rosters || {})[w.winner] || [];
      const winnerStub   = env.GUILD_OBJECTS.get(env.GUILD_OBJECTS.idFromName(w.winner));
      for (const uid of winnerRoster) {
        await winnerStub.fetch('http://internal/xp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, amount: GUILD_XP_SOURCES.clan_war_win, source: 'clan_war_win' }),
        });
      }
    }
  }

  return jsonResponse(data, res.status);
}

/**
 * POST /api/clan-wars/:warId/tick
 * Advances state machine based on current time.
 * Call periodically from any client or scheduled trigger.
 */
async function handleTickClanWar(warId, env) {
  const res  = await _getClanWarStub(warId, env).fetch('http://internal/tick', { method: 'POST' });
  const data = await res.json();

  if (res.status === 200 && data.war) {
    const w = data.war;
    await env.GUILDS_KV.put(`clanwar:${warId}`, JSON.stringify({
      id: warId, challengerGuildId: w.challengerGuildId, defenderGuildId: w.defenderGuildId,
      status: w.status, windowStart: w.windowStart, proposedWindowStart: w.proposedWindowStart,
      challengedAt: w.challengedAt, winner: w.winner,
    }));
    if (w.status === 'completed' || w.status === 'cancelled') {
      await Promise.all([
        env.GUILDS_KV.delete(`guild:active-war:${w.challengerGuildId}`),
        env.GUILDS_KV.delete(`guild:active-war:${w.defenderGuildId}`),
      ]);
    }
  }

  return jsonResponse(data, res.status);
}

// ── Clan War Slot Handlers ────────────────────────────────────────────────────

/**
 * GET /api/clan-wars/:warId/slots
 * Returns the 5 slot objects for an in_progress war.
 */
async function handleGetClanWarSlots(warId, env) {
  const res = await _getClanWarStub(warId, env).fetch('http://internal/slots', { method: 'GET' });
  return jsonResponse(await res.json(), res.status);
}

/**
 * POST /api/clan-wars/:warId/slots/:slotIndex/room
 * Body: { actorId, battleRoomCode? }
 * First call (no battleRoomCode): returns { role:'host', battleRoomCode:null } — caller should create room.
 * Second call (with battleRoomCode): registers the room code, returns { role:'host', battleRoomCode }.
 * Subsequent calls from other player: returns { role:'guest', battleRoomCode }.
 */
async function handleClanWarSlotRoom(warId, slotIndex, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const res = await _getClanWarStub(warId, env).fetch(
    `http://internal/slots/${slotIndex}/room`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  return jsonResponse(await res.json(), res.status);
}

/**
 * POST /api/clan-wars/:warId/slots/:slotIndex/result
 * Body: { actorId, result: 'challenger_win'|'defender_win'|'draw' }
 * Reports the outcome of a slot match. Auto-completes the war if 3+ wins reached.
 */
async function handleClanWarSlotResult(warId, slotIndex, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const res = await _getClanWarStub(warId, env).fetch(
    `http://internal/slots/${slotIndex}/result`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  // If war completed via slot result, release active-war KV locks and award XP
  if (res.status === 200 && data.war && data.war.status === 'completed') {
    const w = data.war;
    await Promise.all([
      env.GUILDS_KV.delete(`guild:active-war:${w.challengerGuildId}`),
      env.GUILDS_KV.delete(`guild:active-war:${w.defenderGuildId}`),
      env.GUILDS_KV.put(`clanwar:${w.id}`, JSON.stringify({
        id: w.id, challengerGuildId: w.challengerGuildId, defenderGuildId: w.defenderGuildId,
        status: 'completed', windowStart: w.windowStart, winner: w.winner, completedAt: w.completedAt,
      })),
    ]);
    if (w.winner && w.winner !== 'draw') {
      const winnerRoster = (data.slots || [])
        .filter(s => (s.result === 'challenger_win' && w.winner === w.challengerGuildId) ||
                     (s.result === 'defender_win'   && w.winner === w.defenderGuildId))
        .map(s => w.winner === w.challengerGuildId ? s.challengerUserId : s.defenderUserId)
        .filter(Boolean);
      const winnerStub = env.GUILD_OBJECTS.get(env.GUILD_OBJECTS.idFromName(w.winner));
      for (const uid of winnerRoster) {
        await winnerStub.fetch('http://internal/xp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, amount: GUILD_XP_SOURCES.clan_war_win, source: 'clan_war_win' }),
        });
      }
    }
  }
  return jsonResponse(data, res.status);
}

/**
 * POST /api/clan-wars/:warId/slots/:slotIndex/forfeit
 * Body: { actorId }
 * Forfeits a waiting/in_progress slot. Auto-completes war if 3+ wins reached.
 */
async function handleClanWarSlotForfeit(warId, slotIndex, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const res = await _getClanWarStub(warId, env).fetch(
    `http://internal/slots/${slotIndex}/forfeit`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  if (res.status === 200 && data.war && data.war.status === 'completed') {
    const w = data.war;
    await Promise.all([
      env.GUILDS_KV.delete(`guild:active-war:${w.challengerGuildId}`),
      env.GUILDS_KV.delete(`guild:active-war:${w.defenderGuildId}`),
      env.GUILDS_KV.put(`clanwar:${w.id}`, JSON.stringify({
        id: w.id, challengerGuildId: w.challengerGuildId, defenderGuildId: w.defenderGuildId,
        status: 'completed', windowStart: w.windowStart, winner: w.winner, completedAt: w.completedAt,
      })),
    ]);
  }
  return jsonResponse(data, res.status);
}

// ── Guild API Handlers ────────────────────────────────────────────────────────

/**
 * POST /api/guilds
 * Body: { userId, name, tag, description?, emblem?, bannerColor? }
 * Creates a new guild. The caller (userId) becomes the owner.
 */
async function handlePostGuild(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { userId, name, tag, description = '', emblem = '⚔️', bannerColor = '#1e40af', isPrivate = false } = body;

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return jsonResponse({ error: 'userId is required' }, 400);
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > GUILD_NAME_MAX) {
    return jsonResponse({ error: `name must be 2–${GUILD_NAME_MAX} characters` }, 400);
  }
  if (!tag || !GUILD_TAG_REGEX.test(String(tag).toUpperCase())) {
    return jsonResponse({ error: 'tag must be 3–5 uppercase alphanumeric characters' }, 400);
  }
  if (typeof description === 'string' && description.length > GUILD_DESC_MAX) {
    return jsonResponse({ error: `description must be ≤ ${GUILD_DESC_MAX} characters` }, 400);
  }

  const normalTag = String(tag).toUpperCase();

  const [existingGuildId, tagOwner] = await Promise.all([
    env.GUILDS_KV.get(`user:${userId}:guild`),
    env.GUILDS_KV.get(`guild:tag:${normalTag}`),
  ]);
  if (existingGuildId) return jsonResponse({ error: 'User already belongs to a guild' }, 409);
  if (tagOwner) return jsonResponse({ error: 'Guild tag is already taken' }, 409);

  const guildId = crypto.randomUUID();
  const now = new Date().toISOString();
  const guild = {
    id: guildId,
    name: name.trim(),
    tag: normalTag,
    description,
    emblem,
    bannerColor,
    level: 1,
    xp: 0,
    memberCount: 1,
    guildRating: 0,
    isPrivate: !!isPrivate,
    createdAt: now,
  };

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/init', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild, ownerId: userId }),
  });
  const data = await doRes.json();
  if (doRes.status !== 201 && doRes.status !== 200) {
    return jsonResponse(data, doRes.status);
  }

  await Promise.all([
    env.GUILDS_KV.put(`user:${userId}:guild`, guildId),
    env.GUILDS_KV.put(`guild:tag:${normalTag}`, guildId),
    env.GUILDS_KV.put(`guild:index:${guildId}`, JSON.stringify({
      id: guildId, name: guild.name, tag: normalTag, emblem, bannerColor,
      level: 1, memberCount: 1, guildRating: 0, isPrivate: !!isPrivate,
    })),
  ]);

  return jsonResponse(data, 201);
}

/**
 * GET /api/guilds?search=:query
 * Searches guilds by name/tag. Returns up to 50 results.
 */
async function handleSearchGuilds(request, env) {
  const q = (new URL(request.url).searchParams.get('search') || '').trim().toLowerCase();
  const { keys } = await env.GUILDS_KV.list({ prefix: 'guild:index:' });
  const summaries = await Promise.all(
    keys.map(async (k) => {
      const raw = await env.GUILDS_KV.get(k.name);
      return raw ? JSON.parse(raw) : null;
    })
  );
  const results = summaries
    .filter(g => g !== null)
    .filter(g => !q || g.name.toLowerCase().includes(q) || g.tag.toLowerCase().includes(q))
    .slice(0, 50);
  return jsonResponse(results);
}

/**
 * GET /api/guilds/:guildId
 * Returns guild object + member list.
 */
async function handleGetGuild(guildId, env) {
  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/', { method: 'GET' });
  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

/**
 * PATCH /api/guilds/:guildId
 * Body: { userId, name?, description?, emblem?, bannerColor? }
 * Updates mutable fields. Requires owner or officer role.
 */
async function handlePatchGuild(guildId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { userId, name, description, emblem, bannerColor, isPrivate } = body;
  if (!userId || typeof userId !== 'string') {
    return jsonResponse({ error: 'userId is required' }, 400);
  }
  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > GUILD_NAME_MAX)) {
    return jsonResponse({ error: `name must be 2–${GUILD_NAME_MAX} characters` }, 400);
  }
  if (description !== undefined && (typeof description !== 'string' || description.length > GUILD_DESC_MAX)) {
    return jsonResponse({ error: `description must be ≤ ${GUILD_DESC_MAX} characters` }, 400);
  }

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/update', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, name: name ? name.trim() : undefined, description, emblem, bannerColor, isPrivate }),
  });
  const data = await doRes.json();

  if (doRes.status === 200 && data.guild) {
    const g = data.guild;
    await env.GUILDS_KV.put(`guild:index:${guildId}`, JSON.stringify({
      id: g.id, name: g.name, tag: g.tag, emblem: g.emblem, bannerColor: g.bannerColor,
      level: g.level, memberCount: g.memberCount, guildRating: g.guildRating, isPrivate: !!g.isPrivate,
    }));
  }

  return jsonResponse(data, doRes.status);
}

/**
 * DELETE /api/guilds/:guildId
 * Body: { userId }
 * Disbands the guild. Owner only.
 */
async function handleDeleteGuild(guildId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { userId } = body;
  if (!userId || typeof userId !== 'string') {
    return jsonResponse({ error: 'userId is required' }, 400);
  }

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/disband', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const data = await doRes.json();

  if (doRes.status === 200 && data.disbanded) {
    await Promise.all([
      env.GUILDS_KV.delete(`guild:tag:${data.tag}`),
      env.GUILDS_KV.delete(`guild:index:${guildId}`),
      ...data.memberIds.map(mid => env.GUILDS_KV.delete(`user:${mid}:guild`)),
    ]);
  }

  return jsonResponse(data, doRes.status);
}

// ── Guild Invite / Join / Leave / Kick Handlers ───────────────────────────────

const GUILD_INVITE_TTL = 48 * 60 * 60; // 48 hours in seconds
const LEAVE_COOLDOWN_TTL = 60 * 60;    // 1 hour in seconds

/**
 * POST /api/guilds/:guildId/invite
 * Body: { inviterId, inviteeUsername }
 * Any guild member can invite a player by username (displayName).
 */
async function handleGuildInvite(guildId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { inviterId, inviteeUsername } = body;
  if (!inviterId || typeof inviterId !== 'string') return jsonResponse({ error: 'inviterId is required' }, 400);
  if (!inviteeUsername || typeof inviteeUsername !== 'string') return jsonResponse({ error: 'inviteeUsername is required' }, 400);

  const trimmedInvitee = inviteeUsername.trim();
  if (!trimmedInvitee) return jsonResponse({ error: 'inviteeUsername cannot be empty' }, 400);

  // Check the inviter is actually in this guild
  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/', { method: 'GET' });
  const data = await doRes.json();
  if (doRes.status !== 200) return jsonResponse(data, doRes.status);

  const member = (data.members || []).find(m => m.userId === inviterId);
  if (!member) return jsonResponse({ error: 'You are not a member of this guild' }, 403);

  // Check invitee is not already in a guild
  const existingGuildId = await env.GUILDS_KV.get(`user:${trimmedInvitee}:guild`);
  if (existingGuildId) return jsonResponse({ error: 'Player is already in a guild' }, 409);

  // Check guild is not full
  if (data.guild.memberCount >= GUILD_MEMBERS_MAX) return jsonResponse({ error: 'Guild is full' }, 409);

  // Check for duplicate pending invite
  const { keys: existingKeys } = await env.GUILDS_KV.list({ prefix: `user-invites:${trimmedInvitee}:` });
  for (const k of existingKeys) {
    const inv = await env.GUILDS_KV.get(k.name, { type: 'json' });
    if (inv && inv.guildId === guildId) return jsonResponse({ error: 'Invite already pending for this player' }, 409);
  }

  const inviteId = crypto.randomUUID();
  const invite = {
    id: inviteId,
    guildId,
    guildName: data.guild.name,
    guildTag: data.guild.tag,
    guildEmblem: data.guild.emblem,
    guildLevel: data.guild.level,
    guildMemberCount: data.guild.memberCount,
    inviterId,
    inviteeUserId: trimmedInvitee,
    createdAt: new Date().toISOString(),
  };

  await Promise.all([
    env.GUILDS_KV.put(`guild-invite:${inviteId}`, JSON.stringify(invite), { expirationTtl: GUILD_INVITE_TTL }),
    env.GUILDS_KV.put(`user-invites:${trimmedInvitee}:${inviteId}`, '', { expirationTtl: GUILD_INVITE_TTL }),
  ]);

  return jsonResponse({ invited: true, inviteId });
}

/**
 * GET /api/guild-invites?userId=:displayName
 * Returns all pending invites for the given user.
 */
async function handleGetGuildInvites(request, env) {
  const userId = (new URL(request.url).searchParams.get('userId') || '').trim();
  if (!userId) return jsonResponse({ error: 'userId is required' }, 400);

  const { keys } = await env.GUILDS_KV.list({ prefix: `user-invites:${userId}:` });
  const invites = (await Promise.all(
    keys.map(async k => {
      const inviteId = k.name.split(':').pop();
      return env.GUILDS_KV.get(`guild-invite:${inviteId}`, { type: 'json' });
    })
  )).filter(Boolean);

  return jsonResponse(invites);
}

/**
 * POST /api/guild-invites/:inviteId/accept
 * Body: { userId }
 * Accepts the invite and adds the user as a member.
 */
async function handleAcceptGuildInvite(inviteId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { userId } = body;
  if (!userId || typeof userId !== 'string') return jsonResponse({ error: 'userId is required' }, 400);

  const invite = await env.GUILDS_KV.get(`guild-invite:${inviteId}`, { type: 'json' });
  if (!invite) return jsonResponse({ error: 'Invite not found or expired' }, 404);
  if (invite.inviteeUserId !== userId) return jsonResponse({ error: 'This invite is not for you' }, 403);

  // Check cooldown
  const cooldown = await env.GUILDS_KV.get(`leave-cooldown:${userId}`);
  if (cooldown) return jsonResponse({ error: 'You must wait before joining another guild (1-hour cooldown)' }, 429);

  // Check user not already in a guild
  const existingGuildId = await env.GUILDS_KV.get(`user:${userId}:guild`);
  if (existingGuildId) return jsonResponse({ error: 'You are already in a guild' }, 409);

  // Add to guild via DO
  const doId = env.GUILD_OBJECTS.idFromName(invite.guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const data = await doRes.json();
  if (doRes.status !== 200) return jsonResponse(data, doRes.status);

  // Update KV
  const g = data.guild;
  await Promise.all([
    env.GUILDS_KV.put(`user:${userId}:guild`, invite.guildId),
    env.GUILDS_KV.put(`guild:index:${invite.guildId}`, JSON.stringify({
      id: g.id, name: g.name, tag: g.tag, emblem: g.emblem, bannerColor: g.bannerColor,
      level: g.level, memberCount: g.memberCount, guildRating: g.guildRating, isPrivate: !!g.isPrivate,
    })),
    env.GUILDS_KV.delete(`guild-invite:${inviteId}`),
    env.GUILDS_KV.delete(`user-invites:${userId}:${inviteId}`),
  ]);

  return jsonResponse({ accepted: true, guild: data.guild, members: data.members });
}

/**
 * POST /api/guild-invites/:inviteId/decline
 * Body: { userId }
 */
async function handleDeclineGuildInvite(inviteId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { userId } = body;
  if (!userId || typeof userId !== 'string') return jsonResponse({ error: 'userId is required' }, 400);

  const invite = await env.GUILDS_KV.get(`guild-invite:${inviteId}`, { type: 'json' });
  if (!invite) return jsonResponse({ error: 'Invite not found or expired' }, 404);
  if (invite.inviteeUserId !== userId) return jsonResponse({ error: 'This invite is not for you' }, 403);

  await Promise.all([
    env.GUILDS_KV.delete(`guild-invite:${inviteId}`),
    env.GUILDS_KV.delete(`user-invites:${userId}:${inviteId}`),
  ]);

  return jsonResponse({ declined: true });
}

/**
 * POST /api/guilds/:guildId/join-requests
 * Body: { userId }
 * Submits a join request for open guilds.
 */
async function handlePostJoinRequest(guildId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { userId } = body;
  if (!userId || typeof userId !== 'string') return jsonResponse({ error: 'userId is required' }, 400);

  const cooldown = await env.GUILDS_KV.get(`leave-cooldown:${userId}`);
  if (cooldown) return jsonResponse({ error: 'You must wait before joining another guild (1-hour cooldown)' }, 429);

  const existingGuildId = await env.GUILDS_KV.get(`user:${userId}:guild`);
  if (existingGuildId) return jsonResponse({ error: 'You are already in a guild' }, 409);

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/join-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

/**
 * GET /api/guilds/:guildId/join-requests?actorId=:id
 * Returns pending join requests. Officer/owner only.
 */
async function handleGetJoinRequests(guildId, request, env) {
  const actorId = (new URL(request.url).searchParams.get('actorId') || '').trim();
  if (!actorId) return jsonResponse({ error: 'actorId is required' }, 400);

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);

  // Verify actor role
  const guildRes = await doStub.fetch('http://internal/', { method: 'GET' });
  const guildData = await guildRes.json();
  if (guildRes.status !== 200) return jsonResponse(guildData, guildRes.status);
  const actor = (guildData.members || []).find(m => m.userId === actorId);
  if (!actor) return jsonResponse({ error: 'Not a guild member' }, 403);
  if (actor.role === 'member') return jsonResponse({ error: 'Only officers and owner can view join requests' }, 403);

  const reqRes = await doStub.fetch('http://internal/join-requests', { method: 'GET' });
  const requests = await reqRes.json();
  return jsonResponse(requests, reqRes.status);
}

/**
 * PATCH /api/guilds/:guildId/join-requests/:requesterId
 * Body: { actorId, action: 'approve' | 'deny' }
 */
async function handlePatchJoinRequest(guildId, requesterId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { actorId, action } = body;
  if (!actorId || typeof actorId !== 'string') return jsonResponse({ error: 'actorId is required' }, 400);
  if (action !== 'approve' && action !== 'deny') return jsonResponse({ error: 'action must be approve or deny' }, 400);

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);

  // Verify actor is officer or owner
  const guildRes = await doStub.fetch('http://internal/', { method: 'GET' });
  const guildData = await guildRes.json();
  if (guildRes.status !== 200) return jsonResponse(guildData, guildRes.status);
  const actor = (guildData.members || []).find(m => m.userId === actorId);
  if (!actor) return jsonResponse({ error: 'Not a guild member' }, 403);
  if (actor.role === 'member') return jsonResponse({ error: 'Only officers and owner can manage join requests' }, 403);

  if (action === 'deny') {
    const remRes = await doStub.fetch('http://internal/join-request', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: requesterId }),
    });
    return jsonResponse(await remRes.json(), remRes.status);
  }

  // approve — check cooldown and existing guild
  const cooldown = await env.GUILDS_KV.get(`leave-cooldown:${requesterId}`);
  if (cooldown) return jsonResponse({ error: 'Player must wait before joining a guild (1-hour cooldown)' }, 429);

  const existingGuildId = await env.GUILDS_KV.get(`user:${requesterId}:guild`);
  if (existingGuildId) return jsonResponse({ error: 'Player is already in a guild' }, 409);

  // Remove request, then add as member
  await doStub.fetch('http://internal/join-request', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: requesterId }),
  });

  const joinRes = await doStub.fetch('http://internal/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: requesterId }),
  });
  const joinData = await joinRes.json();
  if (joinRes.status !== 200) return jsonResponse(joinData, joinRes.status);

  const g = joinData.guild;
  await Promise.all([
    env.GUILDS_KV.put(`user:${requesterId}:guild`, guildId),
    env.GUILDS_KV.put(`guild:index:${guildId}`, JSON.stringify({
      id: g.id, name: g.name, tag: g.tag, emblem: g.emblem, bannerColor: g.bannerColor,
      level: g.level, memberCount: g.memberCount, guildRating: g.guildRating, isPrivate: !!g.isPrivate,
    })),
  ]);

  return jsonResponse({ approved: true, guild: joinData.guild, members: joinData.members });
}

/**
 * POST /api/guilds/:guildId/leave
 * Body: { userId }
 */
async function handleLeaveGuild(guildId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { userId } = body;
  if (!userId || typeof userId !== 'string') return jsonResponse({ error: 'userId is required' }, 400);

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const data = await doRes.json();
  if (doRes.status !== 200) return jsonResponse(data, doRes.status);

  const promises = [
    env.GUILDS_KV.delete(`user:${userId}:guild`),
    env.GUILDS_KV.put(`leave-cooldown:${userId}`, '1', { expirationTtl: LEAVE_COOLDOWN_TTL }),
  ];

  if (data.disbanded) {
    promises.push(
      env.GUILDS_KV.delete(`guild:tag:${data.tag}`),
      env.GUILDS_KV.delete(`guild:index:${guildId}`),
    );
  } else {
    const g = data.guild;
    promises.push(
      env.GUILDS_KV.put(`guild:index:${guildId}`, JSON.stringify({
        id: g.id, name: g.name, tag: g.tag, emblem: g.emblem, bannerColor: g.bannerColor,
        level: g.level, memberCount: g.memberCount, guildRating: g.guildRating, isPrivate: !!g.isPrivate,
      }))
    );
  }

  await Promise.all(promises);
  return jsonResponse(data);
}

/**
 * POST /api/guilds/:guildId/promote
 * Body: { actorId, targetUserId, newRole }
 * Changes a member's role. Only the owner can promote/demote.
 * newRole = 'officer' | 'member' | 'owner' (owner transfer: caller becomes officer).
 */
async function handlePromoteMember(guildId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { actorId, targetUserId, newRole } = body;
  if (!actorId || !targetUserId || !newRole) {
    return jsonResponse({ error: 'actorId, targetUserId, and newRole are required' }, 400);
  }

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/promote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId, targetUserId, newRole }),
  });
  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

/**
 * POST /api/guilds/:guildId/kick
 * Body: { actorId, targetUserId }
 */
async function handleKickMember(guildId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { actorId, targetUserId } = body;
  if (!actorId || typeof actorId !== 'string') return jsonResponse({ error: 'actorId is required' }, 400);
  if (!targetUserId || typeof targetUserId !== 'string') return jsonResponse({ error: 'targetUserId is required' }, 400);

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/kick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId, targetUserId }),
  });
  const data = await doRes.json();
  if (doRes.status !== 200) return jsonResponse(data, doRes.status);

  const g = data.guild;
  await Promise.all([
    env.GUILDS_KV.delete(`user:${targetUserId}:guild`),
    env.GUILDS_KV.put(`guild:index:${guildId}`, JSON.stringify({
      id: g.id, name: g.name, tag: g.tag, emblem: g.emblem, bannerColor: g.bannerColor,
      level: g.level, memberCount: g.memberCount, guildRating: g.guildRating, isPrivate: !!g.isPrivate,
    })),
  ]);

  return jsonResponse(data);
}

/**
 * POST /api/guilds/:guildId/xp
 * Body: { userId, source }
 * Internal endpoint called by match/mission systems when XP events fire.
 * source must be one of: standard_match_win, tournament_match_win, clan_war_win, daily_mission
 */
async function handlePostGuildXp(guildId, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { userId, source } = body;
  if (!source || !GUILD_XP_SOURCES[source]) {
    return jsonResponse({ error: `source must be one of: ${Object.keys(GUILD_XP_SOURCES).join(', ')}` }, 400);
  }
  const amount = GUILD_XP_SOURCES[source];

  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/xp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount, source }),
  });
  const data = await doRes.json();

  // Update KV index if level changed
  if (doRes.status === 200 && data.guild) {
    const g = data.guild;
    await env.GUILDS_KV.put(`guild:index:${guildId}`, JSON.stringify({
      id: g.id, name: g.name, tag: g.tag, emblem: g.emblem, bannerColor: g.bannerColor,
      level: g.level, memberCount: g.memberCount, guildRating: g.guildRating, isPrivate: !!g.isPrivate,
    }));
  }

  return jsonResponse(data, doRes.status);
}

/**
 * GET /api/guilds/:guildId/xp-log?limit=50&offset=0
 * Returns paginated XP event log for a guild.
 */
async function handleGetGuildXpLog(guildId, request, env) {
  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const reqUrl = new URL(request.url);
  const doRes = await doStub.fetch(
    `http://internal/xp-log?${reqUrl.searchParams.toString()}`,
    { method: 'GET' }
  );
  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

/**
 * GET /api/guilds/:guildId/leaderboard?period=weekly
 * Returns weekly contribution leaderboard + last week snapshot.
 */
async function handleGetGuildLeaderboard(guildId, env) {
  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const doRes = await doStub.fetch('http://internal/leaderboard', { method: 'GET' });
  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

/**
 * GET /api/guilds/:guildId/weekly-notification?userId=X
 * Returns (and clears) the pending weekly summary notification for a member.
 */
async function handleGetWeeklyNotification(guildId, request, env) {
  const doId = env.GUILD_OBJECTS.idFromName(guildId);
  const doStub = env.GUILD_OBJECTS.get(doId);
  const reqUrl = new URL(request.url);
  const doRes = await doStub.fetch(
    `http://internal/weekly-notification?${reqUrl.searchParams.toString()}`,
    { method: 'GET' }
  );
  const data = await doRes.json();
  return jsonResponse(data, doRes.status);
}

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
    } else if (method === 'GET' && /^\/battle\/room\/[A-Z0-9]{4}\/spectate$/.test(url.pathname)) {
      const code = url.pathname.split('/')[3];
      response = await handleBattleRoomSpectate(request, code, env);
    } else if (/^\/battle\/room\/[A-Z0-9]{4}\/ws$/.test(url.pathname)) {
      const code = url.pathname.split('/')[3];
      return handleBattleRoomWs(request, code, env);
    } else if (method === 'GET' && url.pathname === '/battle/rooms/live') {
      response = await handleBattleRoomsLive(request, env);
    } else if (method === 'POST' && url.pathname === '/battle/quickmatch') {
      response = await handleBattleQuickMatch(request, env);
    } else if (method === 'POST' && url.pathname === '/api/tournaments') {
      response = await handlePostTournament(request, env);
    } else if (method === 'GET' && /^\/api\/tournaments\/[a-f0-9]{16}$/.test(url.pathname)) {
      const tid = url.pathname.split('/').pop();
      response = await handleGetTournament(tid, env);
    } else if (method === 'POST' && /^\/api\/tournaments\/[a-f0-9]{16}\/match-complete$/.test(url.pathname)) {
      const tid = url.pathname.split('/')[3];
      response = await handlePostMatchComplete(tid, request, env);
    } else if (method === 'POST' && /^\/api\/tournaments\/[a-f0-9]{16}\/match-join$/.test(url.pathname)) {
      const tid = url.pathname.split('/')[3];
      response = await handlePostMatchJoin(tid, request, env);
    } else if (method === 'POST' && /^\/api\/tournaments\/[a-f0-9]{16}\/match-heartbeat$/.test(url.pathname)) {
      const tid = url.pathname.split('/')[3];
      response = await handlePostMatchHeartbeat(tid, request, env);
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
    } else if (method === 'POST' && url.pathname === '/api/battle/ratings') {
      response = await handlePostBattleRating(request, env);
    } else if (method === 'GET' && url.pathname === '/api/battle/ratings') {
      response = await handleGetBattleLeaderboard(env);
    } else if (method === 'GET' && url.pathname === '/api/season') {
      response = await handleGetSeason(env);
    } else if (method === 'GET' && url.pathname === '/api/season/ratings') {
      response = await handleGetSeasonRatingLeaderboard(request, env);
    } else if (method === 'GET' && url.pathname === '/api/season/hall-of-fame') {
      response = await handleGetHallOfFame(env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/season/rating-snapshot/')) {
      const seasonId = url.pathname.replace('/api/season/rating-snapshot/', '');
      response = await handleGetSeasonRatingSnapshot(seasonId, env);
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
    } else if (method === 'POST' && url.pathname === '/api/clan-wars') {
      response = await handlePostClanWarChallenge(request, env);
    } else if (method === 'GET' && /^\/api\/clan-wars\/[^/]+$/.test(url.pathname)) {
      const warId = url.pathname.split('/').pop();
      response = await handleGetClanWar(warId, env);
    } else if (method === 'POST' && /^\/api\/clan-wars\/[^/]+\/respond$/.test(url.pathname)) {
      const warId = url.pathname.split('/')[3];
      response = await handleRespondClanWar(warId, request, env);
    } else if (method === 'POST' && /^\/api\/clan-wars\/[^/]+\/nominate$/.test(url.pathname)) {
      const warId = url.pathname.split('/')[3];
      response = await handleNominateClanWar(warId, request, env);
    } else if (method === 'DELETE' && /^\/api\/clan-wars\/[^/]+\/nominate\/[^/]+$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      response = await handleRemoveNomination(parts[3], decodeURIComponent(parts[5]), request, env);
    } else if (method === 'POST' && /^\/api\/clan-wars\/[^/]+\/complete$/.test(url.pathname)) {
      const warId = url.pathname.split('/')[3];
      response = await handleCompleteClanWar(warId, request, env);
    } else if (method === 'POST' && /^\/api\/clan-wars\/[^/]+\/tick$/.test(url.pathname)) {
      const warId = url.pathname.split('/')[3];
      response = await handleTickClanWar(warId, env);
    } else if (method === 'GET' && /^\/api\/clan-wars\/[^/]+\/slots$/.test(url.pathname)) {
      const warId = url.pathname.split('/')[3];
      response = await handleGetClanWarSlots(warId, env);
    } else if (/^\/api\/clan-wars\/[^/]+\/slots\/\d+\/(room|result|forfeit)$/.test(url.pathname)) {
      const parts     = url.pathname.split('/');
      const warId     = parts[3];
      const slotIndex = parseInt(parts[5], 10);
      const action    = parts[6];
      if (method !== 'POST') {
        response = jsonResponse({ error: 'Method not allowed' }, 405);
      } else if (action === 'room') {
        response = await handleClanWarSlotRoom(warId, slotIndex, request, env);
      } else if (action === 'result') {
        response = await handleClanWarSlotResult(warId, slotIndex, request, env);
      } else {
        response = await handleClanWarSlotForfeit(warId, slotIndex, request, env);
      }
    } else if (method === 'GET' && /^\/api\/guilds\/[^/]+\/clan-wars$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handleGetGuildClanWars(guildId, env);
    } else if (method === 'POST' && url.pathname === '/api/guilds') {
      response = await handlePostGuild(request, env);
    } else if (method === 'GET' && url.pathname === '/api/guilds') {
      response = await handleSearchGuilds(request, env);
    } else if (method === 'GET' && url.pathname === '/api/guild-invites') {
      response = await handleGetGuildInvites(request, env);
    } else if (method === 'POST' && /^\/api\/guild-invites\/[^/]+\/accept$/.test(url.pathname)) {
      const inviteId = url.pathname.split('/')[3];
      response = await handleAcceptGuildInvite(inviteId, request, env);
    } else if (method === 'POST' && /^\/api\/guild-invites\/[^/]+\/decline$/.test(url.pathname)) {
      const inviteId = url.pathname.split('/')[3];
      response = await handleDeclineGuildInvite(inviteId, request, env);
    } else if (method === 'POST' && /^\/api\/guilds\/[^/]+\/invite$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handleGuildInvite(guildId, request, env);
    } else if (method === 'POST' && /^\/api\/guilds\/[^/]+\/join-requests$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handlePostJoinRequest(guildId, request, env);
    } else if (method === 'GET' && /^\/api\/guilds\/[^/]+\/join-requests$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handleGetJoinRequests(guildId, request, env);
    } else if (method === 'PATCH' && /^\/api\/guilds\/[^/]+\/join-requests\/[^/]+$/.test(url.pathname)) {
      const parts = url.pathname.split('/');
      response = await handlePatchJoinRequest(parts[3], parts[5], request, env);
    } else if (method === 'POST' && /^\/api\/guilds\/[^/]+\/leave$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handleLeaveGuild(guildId, request, env);
    } else if (method === 'POST' && /^\/api\/guilds\/[^/]+\/promote$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handlePromoteMember(guildId, request, env);
    } else if (method === 'POST' && /^\/api\/guilds\/[^/]+\/kick$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handleKickMember(guildId, request, env);
    } else if (method === 'POST' && /^\/api\/guilds\/[^/]+\/xp$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handlePostGuildXp(guildId, request, env);
    } else if (method === 'GET' && /^\/api\/guilds\/[^/]+\/xp-log$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handleGetGuildXpLog(guildId, request, env);
    } else if (method === 'GET' && /^\/api\/guilds\/[^/]+\/leaderboard$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handleGetGuildLeaderboard(guildId, env);
    } else if (method === 'GET' && /^\/api\/guilds\/[^/]+\/weekly-notification$/.test(url.pathname)) {
      const guildId = url.pathname.split('/')[3];
      response = await handleGetWeeklyNotification(guildId, request, env);
    } else if (method === 'GET' && url.pathname.startsWith('/api/guilds/')) {
      const guildId = url.pathname.replace('/api/guilds/', '');
      response = await handleGetGuild(guildId, env);
    } else if (method === 'PATCH' && url.pathname.startsWith('/api/guilds/')) {
      const guildId = url.pathname.replace('/api/guilds/', '');
      response = await handlePatchGuild(guildId, request, env);
    } else if (method === 'DELETE' && url.pathname.startsWith('/api/guilds/')) {
      const guildId = url.pathname.replace('/api/guilds/', '');
      response = await handleDeleteGuild(guildId, request, env);
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
