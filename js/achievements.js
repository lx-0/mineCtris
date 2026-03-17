// Achievement system — 39 unlockable achievements with toast notifications.
// Requires: state.js (isSprintMode, isBlitzMode, linesCleared),
//           stats.js (loadLifetimeStats)

const ACH_STORAGE_KEY = "mineCtris_achievements";

const ACHIEVEMENTS = [
  { id: "first_responder",  name: "First Responder",  icon: "\u{1F4CB}", desc: "Clear your first line" },
  { id: "combo_starter",    name: "Combo Starter",    icon: "\u26A1",   desc: "Reach a 2x combo" },
  { id: "combo_king",       name: "Combo King",       icon: "\u{1F451}", desc: "5 consecutive clears" },
  { id: "speed_demon",      name: "Speed Demon",      icon: "\u{1F680}", desc: "Reach level 10 in Classic" },
  { id: "geologist",        name: "Geologist",        icon: "\u26CF\uFE0F", desc: "Mine 100 blocks in one session" },
  { id: "stone_age",        name: "Stone Age",        icon: "\u{1FAA8}", desc: "Craft a Stone Pickaxe" },
  { id: "iron_will",        name: "Iron Will",        icon: "\u{1F527}", desc: "Craft an Iron Pickaxe" },
  { id: "architect",        name: "Architect",        icon: "\u{1F3D7}\uFE0F", desc: "Place 50 blocks from inventory" },
  { id: "lumber_jack",      name: "Lumber Jack",      icon: "\u{1FAB5}", desc: "Mine 20 tree trunks" },
  { id: "tetramino",        name: "Tetramino",        icon: "\u{1F48E}", desc: "Clear 4 lines at once" },
  { id: "daily_devotee",    name: "Daily Devotee",    icon: "\u{1F4C5}", desc: "Complete the daily challenge 3 times" },
  { id: "sprinter",         name: "Sprinter",         icon: "\u{1F3C3}", desc: "Complete Sprint Mode" },
  { id: "speed_sprinter",   name: "Speed Sprinter",   icon: "\u23F1\uFE0F", desc: "Complete Sprint in under 3 minutes" },
  { id: "blitz_bomber",     name: "Blitz Bomber",     icon: "\u{1F4A5}", desc: "Score 5000 points in Blitz Mode" },
  { id: "century_club",     name: "Century Club",     icon: "\u{1F4AF}", desc: "Score 10000 points in Classic" },
  { id: "survivor",         name: "Survivor",         icon: "\u{1F6E1}\uFE0F", desc: "Survive 10 minutes in Classic" },
  { id: "rock_collector",   name: "Rock Collector",   icon: "\u{1FAA8}", desc: "Mine 10 rocks" },
  { id: "alchemist",        name: "Alchemist",        icon: "\u2697\uFE0F", desc: "Craft 5 consumable items" },
  { id: "weekly_champion",  name: "Weekly Champion",  icon: "\u{1F3C5}", desc: "Complete a Weekly Challenge" },
  { id: "puzzle_master",    name: "Puzzle Master",    icon: "\u{1F9E9}", desc: "3-star all 10 puzzles" },
  { id: "completionist",    name: "Completionist",    icon: "\u{1F3C6}", desc: "Unlock 10 achievements" },
  // Creator achievements
  { id: "workshop_owner",   name: "Workshop Owner",   icon: "\u{1F3D7}\uFE0F", desc: "Publish your first puzzle to the community" },
  { id: "crowd_pleaser",    name: "Crowd Pleaser",    icon: "\u{1F389}", desc: "Your puzzle reached 10 plays" },
  { id: "viral",            name: "Viral",            icon: "\u{1F525}", desc: "Your puzzle reached 50 plays" },
  // Survival Mode achievements
  { id: "survival_first",   name: "Born Survivor",    icon: "\u{1F331}", desc: "Complete your first Survival session" },
  { id: "survival_5",       name: "Settled In",       icon: "\u{1F3E0}", desc: "Survive 5 sessions in the same world" },
  { id: "survival_30",      name: "Ancient World",    icon: "\u{1F30D}", desc: "Reach Day 30 in one world" },
  { id: "storm_rider",      name: "Storm Rider",      icon: "\u26C8\uFE0F", desc: "Survive a Piece Storm in Survival mode" },
  { id: "earthquake_proof", name: "Unshakeable",      icon: "\u{1FAA8}", desc: "Survive an Earthquake without dying" },
  // Co-op achievements
  { id: "coop_first",      name: "First Contact",    icon: "\u{1F91D}", desc: "Complete your first co-op session",                    category: "coop" },
  { id: "coop_survive3",   name: "Dynamic Duo",      icon: "\u23F1\uFE0F", desc: "Survive 3 minutes in a co-op session",              category: "coop" },
  { id: "coop_trade5",     name: "Trading Partners", icon: "\u{1F4E6}", desc: "Complete 5 resource trades in one co-op session",      category: "coop" },
  { id: "coop_sync_clear", name: "Synchronicity",    icon: "\u26A1",    desc: "Both players clear lines within 2 seconds of each other", category: "coop" },
  { id: "coop_10k",        name: "Legendary Pair",   icon: "\u{1F3C6}", desc: "Reach a combined score of 10,000 in co-op",            category: "coop" },
  // Battle achievements
  { id: "battle_first_win",   name: "First Blood",    icon: "\u{1F5E1}\uFE0F", desc: "Win your first battle match",                              category: "battle" },
  { id: "battle_comeback",    name: "Comeback Kid",   icon: "\u{1F525}",       desc: "Win a match after receiving 8 or more garbage rows",       category: "battle" },
  { id: "battle_dominator",   name: "Dominator",      icon: "\u{1F480}",       desc: "Win 3 battle matches in a row",                            category: "battle" },
  { id: "battle_speed_kill",  name: "Speed Killer",   icon: "\u26A1",          desc: "Win a match in under 90 seconds",                          category: "battle" },
  { id: "battle_untouchable", name: "Untouchable",    icon: "\u{1F6E1}\uFE0F", desc: "Win a match without receiving any garbage rows",           category: "battle" },
];

// Session counters — reset at the start of each game
let _achSessionTrunks = 0;
let _achSessionRocks  = 0;
// Co-op sync line-clear tracking (ms timestamps; -1 = none this session)
let _achCoopLineClearTs    = -1;
let _achPartnerLineClearTs = -1;

/** Reset session-specific achievement counters. Call from resetGame(). */
function achResetSession() {
  _achSessionTrunks = 0;
  _achSessionRocks  = 0;
  _achCoopLineClearTs    = -1;
  _achPartnerLineClearTs = -1;
}

/** Load achievement state from localStorage. Returns { [id]: { date } }. */
function loadAchievements() {
  try {
    const raw = localStorage.getItem(ACH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

/** Count how many achievements are unlocked. */
function countUnlockedAchievements() {
  return Object.keys(loadAchievements()).length;
}

/**
 * Unlock an achievement by id. Shows a toast on first unlock.
 * No-ops if already unlocked.
 */
function unlockAchievement(id) {
  const state = loadAchievements();
  if (state[id]) return;

  const today = new Date().toISOString().slice(0, 10);
  state[id] = { date: today };
  try { localStorage.setItem(ACH_STORAGE_KEY, JSON.stringify(state)); } catch (_) {}

  const ach = ACHIEVEMENTS.find(a => a.id === id);
  if (ach) _showAchievementToast(ach);

  // Completionist check (unlocking 10 others — don't count itself)
  const total = Object.keys(state).length;
  if (total >= 10 && !state["completionist"]) {
    unlockAchievement("completionist");
  }
}

function _showAchievementToast(ach) {
  const toastEl = document.getElementById("achievement-toast");
  if (!toastEl) return;

  const iconEl = toastEl.querySelector(".ach-toast-icon");
  const nameEl = toastEl.querySelector(".ach-toast-name");
  const descEl = toastEl.querySelector(".ach-toast-desc");
  if (iconEl) iconEl.textContent = ach.icon;
  if (nameEl) nameEl.textContent = ach.name;
  if (descEl) descEl.textContent = ach.desc;

  // Re-trigger CSS animation by removing then re-adding the class
  toastEl.classList.remove("ach-toast-visible");
  void toastEl.offsetWidth; // force reflow
  toastEl.classList.add("ach-toast-visible");

  clearTimeout(toastEl._hideTimer);
  toastEl._hideTimer = setTimeout(() => {
    toastEl.classList.remove("ach-toast-visible");
  }, 3500);
}

// ── Panel rendering ───────────────────────────────────────────────────────────

/** Open the achievements overlay and render the current state. */
function openAchievementsPanel() {
  const overlay = document.getElementById("achievements-overlay");
  if (overlay) {
    renderAchievementsPanel();
    overlay.style.display = "flex";
  }
}

/** Close the achievements overlay. */
function closeAchievementsPanel() {
  const overlay = document.getElementById("achievements-overlay");
  if (overlay) overlay.style.display = "none";
}

// Active filter for the achievements panel ("all" or "coop")
let _achPanelFilter = "all";

/** Render achievement cards with current locked/unlocked state, respecting active filter. */
function renderAchievementsPanel() {
  const unlocked = loadAchievements();
  const count = Object.keys(unlocked).length;

  const progressEl = document.getElementById("achievements-progress");
  if (progressEl) progressEl.textContent = count + " / " + ACHIEVEMENTS.length + " Unlocked";

  // Ensure filter row exists
  const panel = document.getElementById("achievements-panel");
  if (panel) {
    let filterRow = document.getElementById("ach-filter-row");
    if (!filterRow) {
      filterRow = document.createElement("div");
      filterRow.id = "ach-filter-row";
      filterRow.className = "ach-filter-row";
      const gridEl = document.getElementById("achievements-grid");
      if (gridEl) panel.insertBefore(filterRow, gridEl);
    }
    filterRow.innerHTML = "";
    [["all", "All"], ["coop", "Co-op"], ["battle", "Battle"]].forEach(function (pair) {
      const btn = document.createElement("button");
      btn.className = "ach-filter-btn" + (_achPanelFilter === pair[0] ? " active" : "");
      btn.textContent = pair[1];
      btn.addEventListener("click", function () {
        _achPanelFilter = pair[0];
        renderAchievementsPanel();
      });
      filterRow.appendChild(btn);
    });
  }

  const gridEl = document.getElementById("achievements-grid");
  if (!gridEl) return;

  const visible = (_achPanelFilter === "coop" || _achPanelFilter === "battle")
    ? ACHIEVEMENTS.filter(function (a) { return a.category === _achPanelFilter; })
    : ACHIEVEMENTS;

  gridEl.innerHTML = "";
  visible.forEach(ach => {
    const isUnlocked = !!unlocked[ach.id];
    const card = document.createElement("div");
    card.className = "ach-card " + (isUnlocked ? "ach-unlocked" : "ach-locked");

    const iconEl = document.createElement("div");
    iconEl.className = "ach-card-icon";
    iconEl.textContent = ach.icon;

    const infoEl = document.createElement("div");
    infoEl.className = "ach-card-info";

    const nameEl = document.createElement("div");
    nameEl.className = "ach-card-name";
    nameEl.textContent = ach.name;

    const descEl = document.createElement("div");
    descEl.className = "ach-card-desc";
    descEl.textContent = ach.desc;

    infoEl.appendChild(nameEl);
    infoEl.appendChild(descEl);

    const statusEl = document.createElement("div");
    statusEl.className = "ach-card-status";
    statusEl.textContent = isUnlocked ? "\u2714\uFE0F" : "\uD83D\uDD12";

    card.appendChild(iconEl);
    card.appendChild(infoEl);
    if (ach.category === "coop" || ach.category === "battle") {
      const badgeEl = document.createElement("div");
      badgeEl.className = "ach-coop-badge";
      badgeEl.textContent = ach.category === "battle" ? "BATTLE" : "CO-OP";
      card.appendChild(badgeEl);
    }
    card.appendChild(statusEl);
    gridEl.appendChild(card);
  });
}

/** Count how many co-op achievements are unlocked. */
function countCoopAchievementsUnlocked() {
  const unlocked = loadAchievements();
  return ACHIEVEMENTS.filter(function (a) { return a.category === "coop" && unlocked[a.id]; }).length;
}

/** Update the co-op mode-select card with the co-op achievement count. */
function updateCoopModeCardAch() {
  const el = document.getElementById("mode-coop-ach-count");
  if (!el) return;
  const coopTotal = ACHIEVEMENTS.filter(function (a) { return a.category === "coop"; }).length;
  el.textContent = countCoopAchievementsUnlocked() + "/" + coopTotal + " achievements";
}

// ── Trigger functions ─────────────────────────────────────────────────────────

/** Call after each line-clear event with the number of lines cleared. */
function achOnLineClear(count) {
  if (linesCleared >= 1) unlockAchievement("first_responder");
  if (count >= 4)        unlockAchievement("tetramino");
}

/** Call after combo count is updated with the new comboCount value. */
function achOnComboUpdate(count) {
  if (count >= 2) unlockAchievement("combo_starter"); // 2nd consecutive = 1.5x
  if (count >= 5) unlockAchievement("combo_king");
}

/** Call when difficulty tier increases (tier is 0-based; tier 9 = level 10). */
function achOnDifficultyTier(tier) {
  if (tier >= 9) unlockAchievement("speed_demon");
}

/**
 * Call after a block is broken.
 * @param {number} totalMined  current session blocksMined total
 * @param {string|undefined} objectType  "trunk" | "rock" | "leaf" | undefined
 */
function achOnBlockMined(totalMined, objectType) {
  if (totalMined >= 100) unlockAchievement("geologist");
  if (objectType === "trunk") {
    _achSessionTrunks++;
    if (_achSessionTrunks >= 20) unlockAchievement("lumber_jack");
  }
  if (objectType === "rock") {
    _achSessionRocks++;
    if (_achSessionRocks >= 10) unlockAchievement("rock_collector");
  }
}

/** Call after a tool is crafted with its toolTier. */
function achOnCraft(tier) {
  if (tier === "stone")   unlockAchievement("stone_age");
  if (tier === "iron")    unlockAchievement("iron_will");
}

/** Call after a consumable item is crafted; pass cumulative session count. */
function achOnConsumableCraft(total) {
  if (total >= 5) unlockAchievement("alchemist");
}

/** Call after placing a block; pass current blocksPlaced total. */
function achOnBlockPlaced(total) {
  if (total >= 50) unlockAchievement("architect");
}

/**
 * Call after submitting daily lifetime stats (when isDailyChallenge is true).
 * Reads the already-updated lifetime stats.
 */
function achOnDailyComplete() {
  const stats = loadLifetimeStats();
  if (stats.dailyChallengesCompleted >= 3) unlockAchievement("daily_devotee");
}

/** Call at the end of Sprint mode; pass elapsed time in ms. */
function achOnSprintComplete(timeMs) {
  unlockAchievement("sprinter");
  if (timeMs < 180000) unlockAchievement("speed_sprinter"); // under 3 minutes
}

/** Call at the end of Blitz mode; pass final score. */
function achOnBlitzComplete(finalScore) {
  if (finalScore >= 5000) unlockAchievement("blitz_bomber");
}

/**
 * Call periodically during Classic gameplay with the current score.
 * Only fires for Classic (not Sprint or Blitz).
 */
function achOnClassicScore(currentScore) {
  if (!isSprintMode && !isBlitzMode && currentScore >= 10000) {
    unlockAchievement("century_club");
  }
}

/**
 * Call periodically during Classic gameplay with elapsed seconds.
 * Only fires for Classic (not Sprint or Blitz).
 */
function achOnSurvivalTime(seconds) {
  if (!isSprintMode && !isBlitzMode && seconds >= 600) {
    unlockAchievement("survivor");
  }
}

/** Call at game over in Weekly Challenge mode; pass final score. */
function achOnWeeklyComplete(finalScore) {
  if (finalScore > 0) unlockAchievement("weekly_champion");
}

/** Call when a puzzle is completed; pass puzzleId and stars earned. */
function achOnPuzzleComplete(puzzleId, stars) {
  // Puzzle Master: 3-star all 10 puzzles
  if (typeof countThreeStarPuzzles === "function" && countThreeStarPuzzles() >= 10) {
    unlockAchievement("puzzle_master");
  }
}

/**
 * Call after a Survival session is recorded (session survived, not game-over).
 * @param {number} sessionsSurvived  total sessions survived in the current world (after increment)
 */
function achOnSurvivalSessionEnd(sessionsSurvived) {
  if (sessionsSurvived >= 1)  unlockAchievement("survival_first");
  if (sessionsSurvived >= 5)  unlockAchievement("survival_5");
  if (sessionsSurvived >= 30) unlockAchievement("survival_30");
}

/**
 * Call when a world event ends and the player is still alive in Survival mode.
 * Only fires during Survival mode — Storm Rider and Unshakeable must NOT unlock
 * in Classic or other modes.
 * @param {string} eventType  one of the EVENT_TYPES values ("PIECE_STORM", "EARTHQUAKE", …)
 */
function achOnSurvivalEventEnd(eventType) {
  if (typeof isSurvivalMode === "undefined" || !isSurvivalMode) return;
  if (eventType === "PIECE_STORM") unlockAchievement("storm_rider");
  if (eventType === "EARTHQUAKE")  unlockAchievement("earthquake_proof");
}

/** Call after the player successfully publishes a puzzle to the community. */
function achOnPuzzlePublished() {
  unlockAchievement("workshop_owner");
}

/**
 * Call with the list of community puzzles authored by this player.
 * Checks Crowd Pleaser (10 plays) and Viral (50 plays).
 * @param {Array<{id: string, plays: number}>} authoredPuzzles
 */
function achOnCreatorPlayCounts(authoredPuzzles) {
  var maxPlays = 0;
  authoredPuzzles.forEach(function (p) {
    if (typeof p.plays === "number" && p.plays > maxPlays) maxPlays = p.plays;
  });
  if (maxPlays >= 10) unlockAchievement("crowd_pleaser");
  if (maxPlays >= 50) unlockAchievement("viral");
}

// ── Co-op achievement triggers ────────────────────────────────────────────────

/**
 * Call at co-op game over.
 * @param {number} surviveSeconds  total elapsed seconds in the co-op session
 */
function achOnCoopGameOver(surviveSeconds) {
  unlockAchievement("coop_first");
  if (surviveSeconds >= 180) unlockAchievement("coop_survive3");
  updateCoopModeCardAch();
}

/**
 * Call after each successful co-op trade (either player sending or receiving).
 * @param {number} totalTrades  cumulative trades completed by this player this session
 */
function achOnCoopTradeComplete(totalTrades) {
  if (totalTrades >= 5) unlockAchievement("coop_trade5");
}

/**
 * Call when the local player triggers a line-clear in co-op mode.
 * @param {number} ts  Date.now() timestamp in ms
 */
function achOnCoopLineClear(ts) {
  _achCoopLineClearTs = ts;
  if (_achPartnerLineClearTs >= 0 && Math.abs(ts - _achPartnerLineClearTs) <= 2000) {
    unlockAchievement("coop_sync_clear");
  }
}

/**
 * Call when a line-clear message arrives from the partner in co-op mode.
 * @param {number} ts  Date.now() timestamp in ms
 */
function achOnCoopPartnerLineClear(ts) {
  _achPartnerLineClearTs = ts;
  if (_achCoopLineClearTs >= 0 && Math.abs(ts - _achCoopLineClearTs) <= 2000) {
    unlockAchievement("coop_sync_clear");
  }
}

/**
 * Call whenever coopScore is updated.
 * @param {number} totalScore  current combined co-op score
 */
function achOnCoopScoreUpdate(totalScore) {
  if (totalScore >= 10000) unlockAchievement("coop_10k");
}

// ── Battle achievement triggers ───────────────────────────────────────────────

/**
 * Call at the end of a battle match.
 * @param {string} result            'win' | 'loss' | 'draw'
 * @param {number} garbageReceived   total garbage rows received during the match
 * @param {number} durationSeconds   match duration in seconds
 */
function achOnBattleResult(result, garbageReceived, durationSeconds) {
  if (result !== 'win') return;

  unlockAchievement("battle_first_win");

  if (garbageReceived >= 8) unlockAchievement("battle_comeback");

  // Win streak is already updated by updateBattleRating before this call
  const rd = (typeof loadBattleRating === 'function') ? loadBattleRating() : null;
  if (rd && rd.winStreak >= 3) unlockAchievement("battle_dominator");

  if (durationSeconds < 90) unlockAchievement("battle_speed_kill");

  if (garbageReceived === 0) unlockAchievement("battle_untouchable");
}
