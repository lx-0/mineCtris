// Survival Mode — persistent world with roguelite game-over reset.
// Key: mineCtris_survivalWorld (world state)
// Key: mineCtris_survivalStats (lifetime survival stats)
// Requires: state.js, world.js (createBlockMesh, registerBlock), pieces.js (SHAPES)

const SURVIVAL_WORLD_KEY  = "mineCtris_survivalWorld";
const SURVIVAL_STATS_KEY  = "mineCtris_survivalStats";
const SURVIVAL_WORLD_VERSION = 1;

/** Returns true if a survival world exists in localStorage. */
function hasSurvivalWorld() {
  try { return !!localStorage.getItem(SURVIVAL_WORLD_KEY); } catch (_) { return false; }
}

/** Remove the survival world from localStorage. */
function clearSurvivalWorld() {
  try { localStorage.removeItem(SURVIVAL_WORLD_KEY); } catch (_) {}
}

/**
 * Serialize the current survival world to localStorage after each piece lands.
 * Only stores non-default (landed) blocks as a sparse array.
 */
function saveSurvivalWorld() {
  if (!isSurvivalMode) return;
  if (isGameOver || lineClearInProgress) return;

  const blocks = [];
  worldGroup.children.forEach(function (obj) {
    if (obj.name === "landed_block" && obj.userData.isBlock && obj.userData.gridPos) {
      const gp = obj.userData.gridPos;
      blocks.push({
        x: gp.x,
        y: gp.y,
        z: gp.z,
        color: (obj.userData.canonicalColor !== undefined)
          ? obj.userData.canonicalColor
          : obj.material.color.getHex()
      });
    }
  });

  const data = {
    version:       SURVIVAL_WORLD_VERSION,
    score,
    timeAlive:     gameElapsedSeconds,
    sessionNumber: survivalSessionNumber,
    blocks
  };

  try {
    localStorage.setItem(SURVIVAL_WORLD_KEY, JSON.stringify(data));
  } catch (_) {}
}

/**
 * Restore a saved survival world into the current scene.
 * Call before pointer lock so all state is in place when the game starts.
 * Returns true on success, false if no valid save exists.
 */
function restoreSurvivalWorld() {
  let data;
  try {
    const raw = localStorage.getItem(SURVIVAL_WORLD_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
    if (!data || data.version !== SURVIVAL_WORLD_VERSION) return false;
  } catch (_) { return false; }

  score               = data.score       || 0;
  gameElapsedSeconds  = data.timeAlive   || 0;
  survivalSessionNumber = (data.sessionNumber || 1);

  (data.blocks || []).forEach(function (b) {
    const block = createBlockMesh(b.color);
    block.position.set(b.x, b.y, b.z);
    block.name = "landed_block";
    worldGroup.add(block);
    registerBlock(block);
  });

  updateScoreHUD();
  return true;
}

// ── Survival world stats ───────────────────────────────────────────────────
// World stats track cumulative progress for the current world.
// They reset when the world is lost (game over in Survival mode).
// Lifetime stats (totalRuns, bestScore, etc.) are never reset.

function _defaultSurvivalStats() {
  return {
    // World stats — reset on world loss
    sessionsSurvived: 0,       // each survived session = 1 "day"
    totalTimePlayed:  0,       // cumulative seconds across all sessions
    totalBlocksMined: 0,       // cumulative blocks mined
    totalLinesCleared: 0,      // cumulative lines cleared
    totalScore:       0,       // cumulative score
    worldStartedDate: null,    // ISO date string (set on world init)
    eventsSurvived:   0,       // populated by events module
    // Lifetime stats — never reset
    totalRuns:     0,
    bestScore:     0,
    bestTimeAlive: 0,
    bestSessionNumber: 0,
  };
}

function loadSurvivalStats() {
  try {
    const raw = localStorage.getItem(SURVIVAL_STATS_KEY);
    return raw ? Object.assign(_defaultSurvivalStats(), JSON.parse(raw)) : _defaultSurvivalStats();
  } catch (_) {
    return _defaultSurvivalStats();
  }
}

function saveSurvivalStats(stats) {
  try { localStorage.setItem(SURVIVAL_STATS_KEY, JSON.stringify(stats)); } catch (_) {}
}

/**
 * Initialise fresh world stats when a brand-new Survival world is created.
 * Call this only when there is no saved world (first session on a new world).
 */
function initWorldStats() {
  const stats = loadSurvivalStats();
  stats.sessionsSurvived = 0;
  stats.totalTimePlayed  = 0;
  stats.totalBlocksMined = 0;
  stats.totalLinesCleared = 0;
  stats.totalScore       = 0;
  stats.worldStartedDate = new Date().toISOString();
  stats.eventsSurvived   = 0;
  saveSurvivalStats(stats);
}

/**
 * Accumulate stats from a session that ended without game over.
 * @param {{score:number, blocksMined:number, linesCleared:number, timeAlive:number}} params
 */
function recordSurvivedSession({ score, blocksMined, linesCleared, timeAlive }) {
  const stats = loadSurvivalStats();
  stats.sessionsSurvived++;
  stats.totalTimePlayed  += Math.floor(timeAlive);
  stats.totalBlocksMined += blocksMined;
  stats.totalLinesCleared += linesCleared;
  stats.totalScore       += score;
  if (stats.sessionsSurvived > (stats.bestSessionNumber || 0)) {
    stats.bestSessionNumber = stats.sessionsSurvived;
  }
  saveSurvivalStats(stats);
  return stats;
}

/**
 * Clear all world-scoped stats (call when the world is lost).
 * Lifetime stats (totalRuns, bestScore, bestTimeAlive, bestSessionNumber) are preserved.
 */
function resetWorldStats() {
  const stats = loadSurvivalStats();
  stats.sessionsSurvived  = 0;
  stats.totalTimePlayed   = 0;
  stats.totalBlocksMined  = 0;
  stats.totalLinesCleared = 0;
  stats.totalScore        = 0;
  stats.worldStartedDate  = null;
  stats.eventsSurvived    = 0;
  saveSurvivalStats(stats);
}

/**
 * Return the "World Age" label ("Day N") for display.
 * @param {object} [stats]  optional pre-loaded stats object
 */
function getWorldAge(stats) {
  const s = stats || loadSurvivalStats();
  return 'Day ' + s.sessionsSurvived;
}

/**
 * Render the World Card stats panel into #survival-world-card.
 * Shows world age, cumulative stats, and world start date.
 * No-ops if the element does not exist.
 */
function renderWorldCard() {
  const el = document.getElementById('survival-world-card');
  if (!el) return;
  const stats = loadSurvivalStats();
  const hasWorld = typeof hasSurvivalWorld === 'function' && hasSurvivalWorld();
  if (!hasWorld || !stats.worldStartedDate) {
    el.innerHTML = '<div class="wc-new">New world — no history yet.</div>';
    return;
  }
  const totalSecs = stats.totalTimePlayed;
  const hh = Math.floor(totalSecs / 3600);
  const mm = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
  const ss = (totalSecs % 60).toString().padStart(2, '0');
  const timeStr = hh > 0
    ? hh + ':' + mm + ':' + ss
    : mm + ':' + ss;
  const startDate = new Date(stats.worldStartedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const rows = [
    ['WORLD AGE',      getWorldAge(stats)],
    ['TOTAL TIME',     timeStr],
    ['SCORE',          stats.totalScore.toLocaleString()],
    ['LINES CLEARED',  stats.totalLinesCleared],
    ['BLOCKS MINED',   stats.totalBlocksMined],
    ['EVENTS SURVIVED', stats.eventsSurvived || 0],
    ['WORLD BORN',     startDate],
  ];
  el.innerHTML =
    '<div class="wc-title">&#127758; YOUR WORLD</div>' +
    rows.map(function ([label, val]) {
      return '<div class="wc-row"><span class="wc-label">' + label +
             '</span><span class="wc-val">' + val + '</span></div>';
    }).join('');
}

/**
 * Record end-of-run survival stats. Call on game-over before clearing the world.
 * Updates lifetime stats and resets world stats.
 * @param {number} finalScore
 * @param {number} timeAlive   seconds survived this session
 * @param {number} sessionNum  how many sessions on this world (including this one)
 * @returns {object} updated stats (after world reset — contains lifetime totals)
 */
function submitSurvivalStats(finalScore, timeAlive, sessionNum) {
  const stats = loadSurvivalStats();
  stats.totalRuns++;
  if (finalScore > stats.bestScore)         stats.bestScore     = finalScore;
  if (timeAlive  > stats.bestTimeAlive)     stats.bestTimeAlive = timeAlive;
  if (sessionNum > stats.bestSessionNumber) stats.bestSessionNumber = sessionNum;
  // Preserve lifetime stats before world reset
  const lifetime = {
    totalRuns:        stats.totalRuns,
    bestScore:        stats.bestScore,
    bestTimeAlive:    stats.bestTimeAlive,
    bestSessionNumber: stats.bestSessionNumber,
  };
  // Reset world stats
  stats.sessionsSurvived  = 0;
  stats.totalTimePlayed   = 0;
  stats.totalBlocksMined  = 0;
  stats.totalLinesCleared = 0;
  stats.totalScore        = 0;
  stats.worldStartedDate  = null;
  stats.eventsSurvived    = 0;
  saveSurvivalStats(stats);
  // Return an object with lifetime fields for the game-over overlay
  return Object.assign({}, stats, lifetime);
}
