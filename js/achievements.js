// Achievement system — 19 unlockable achievements with toast notifications.
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
  { id: "completionist",    name: "Completionist",    icon: "\u{1F3C6}", desc: "Unlock 10 achievements" },
];

// Session counters — reset at the start of each game
let _achSessionTrunks = 0;
let _achSessionRocks  = 0;

/** Reset session-specific achievement counters. Call from resetGame(). */
function achResetSession() {
  _achSessionTrunks = 0;
  _achSessionRocks  = 0;
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

/** Render all 18 achievement cards with current locked/unlocked state. */
function renderAchievementsPanel() {
  const unlocked = loadAchievements();
  const count = Object.keys(unlocked).length;

  const progressEl = document.getElementById("achievements-progress");
  if (progressEl) progressEl.textContent = count + " / " + ACHIEVEMENTS.length + " Unlocked";

  const gridEl = document.getElementById("achievements-grid");
  if (!gridEl) return;

  gridEl.innerHTML = "";
  ACHIEVEMENTS.forEach(ach => {
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
    card.appendChild(statusEl);
    gridEl.appendChild(card);
  });
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
