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

// ── Survival lifetime stats ────────────────────────────────────────────────

function _defaultSurvivalStats() {
  return {
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
 * Record end-of-run survival stats. Call on game-over before clearing the world.
 * @param {number} finalScore
 * @param {number} timeAlive   seconds survived this session
 * @param {number} sessionNum  how many sessions on this world (including this one)
 * @returns {object} updated stats
 */
function submitSurvivalStats(finalScore, timeAlive, sessionNum) {
  const stats = loadSurvivalStats();
  stats.totalRuns++;
  if (finalScore > stats.bestScore)         stats.bestScore     = finalScore;
  if (timeAlive  > stats.bestTimeAlive)     stats.bestTimeAlive = timeAlive;
  if (sessionNum > stats.bestSessionNumber) stats.bestSessionNumber = sessionNum;
  saveSurvivalStats(stats);
  return stats;
}
