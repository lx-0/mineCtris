// Game reset — resets all state for a new game.
// Requires: core/gamestate.js loaded first.

function resetGame() {
  // Survival: if exiting without game over, record this as a survived session.
  if (isSurvivalMode && !isGameOver && typeof recordSurvivedSession === 'function') {
    recordSurvivedSession({
      score:        score,
      blocksMined:  blocksMined,
      linesCleared: linesCleared,
      timeAlive:    gameElapsedSeconds,
    });
  }

  if (typeof resetBgMusic === "function") resetBgMusic();
  if (typeof clearSaveState === "function") clearSaveState();
  // Remove landed blocks (keep ground and trees)
  const toRemove = worldGroup.children.filter(
    (c) => c.name === "landed_block"
  );
  toRemove.forEach((b) => worldGroup.remove(b));

  // Clear falling pieces
  fallingPieces.forEach((p) => fallingPiecesGroup.remove(p));
  fallingPieces.length = 0;
  spawnTimer = 0;

  // Reset grid occupancy
  gridOccupancy.clear();

  // Clear hazard block tracking
  if (typeof clearHazardBlocks === 'function') clearHazardBlocks();

  // Reset fog to initial clear density
  if (scene.fog) scene.fog.density = 0.002;

  // Snap post-processing grade back to normal
  if (typeof resetPostProcessing === 'function') resetPostProcessing();

  // Reset score / stats
  score = 0;
  blocksMined = 0;
  linesCleared = 0;
  gameElapsedSeconds = 0;
  lastHudSecond = -1;

  // Reset session stats for lifetime tracking
  blocksPlaced = 0;
  sessionCrafts = 0;
  sessionConsumableCrafts = 0;
  sessionHighestComboCount = 0;
  if (typeof achResetSession === "function") achResetSession();
  if (typeof resetMissionSession === "function") resetMissionSession();

  // Reset difficulty
  difficultyMultiplier = 1.0;
  lastDifficultyTier = 0;
  speedUpBannerTimer = 0;
  if (speedUpBannerEl) {
    speedUpBannerEl.style.display = "none";
    speedUpBannerEl.style.color = "";
  }

  // Reset inventory
  inventory = {};
  selectedBlockColor = null;
  updateInventoryHUD();

  // Reset crafting state
  pickaxeTier        = "none";
  hasCraftingBench   = false;
  consumables        = { lava_flask: 0, ice_bridge: 0 };
  powerUps           = { row_bomb: 0, slow_down: 0, shield: 0, magnet: 0, time_freeze: 0, sabotage: 0, counter: 0, fortress: 0 };
  iceBridgeSlowActive = false;
  iceBridgeSlowTimer  = 0.0;
  // Reset power-up effect state
  equippedPowerUpType = null;
  slowDownActive = false;
  slowDownTimer  = 0.0;
  shieldActive   = false;
  magnetActive   = false;
  magnetTimer    = 0.0;
  magnetLastPullTime = 0.0;
  timeFreezeActive = false;
  timeFreezeTimer  = 0.0;
  counterActive  = false;
  fortressActive = false;
  fortressTimer  = 0.0;
  obsidianPickaxeActive = false;
  const powerupHudEl = document.getElementById("powerup-hud");
  if (powerupHudEl) powerupHudEl.style.display = "none";
  closeCraftingPanel();

  // Clear tree respawn queue
  treeRespawnQueue.length = 0;

  // Reset nudge state
  nudgeCooldown = 0;
  const nudgeHintEl = document.getElementById("nudge-hint");
  if (nudgeHintEl) nudgeHintEl.style.display = "none";

  // Reset sprint state
  isSprintMode      = false;
  sprintTimerActive = false;
  sprintElapsedMs   = 0;
  sprintComplete    = false;
  const sprintCompleteEl = document.getElementById("sprint-complete-screen");
  if (sprintCompleteEl) sprintCompleteEl.style.display = "none";

  // Reset blitz state
  isBlitzMode       = false;
  blitzTimerActive  = false;
  blitzRemainingMs  = BLITZ_DURATION_MS;
  blitzComplete     = false;
  blitzBonusActive  = false;
  const blitzCompleteEl = document.getElementById("blitz-complete-screen");
  if (blitzCompleteEl) blitzCompleteEl.style.display = "none";
  // Reset timer HUD color
  if (scoreEl) {
    const timerEl = scoreEl.querySelector(".hud-stat:nth-child(4)");
    if (timerEl) timerEl.style.color = "";
  }

  // Reset co-op mode state
  isCoopMode = false;
  coopPieceQueue.length = 0;
  _coopPosBroadcastLastTime = 0;
  _coopPosLastSent = null;
  coopScore = 0;
  coopMyScore = 0;
  coopPartnerScore = 0;
  coopPartnerMaxY = 0;
  coopHeightBroadcastLastTime = 0;
  coopPartnerStatus = 'disconnected';
  coopPartnerLastSeenTime = 0;
  coopMyBlocksMined = 0;
  coopMyLinesTriggered = 0;
  coopMyCraftsMade = 0;
  coopMyTradesCompleted = 0;
  coopPartnerBlocksMined = 0;
  coopPartnerLinesTriggered = 0;
  coopPartnerCraftsMade = 0;
  coopPartnerTradesCompleted = 0;
  coopPartnerName = '';
  coopStatsReceived = false;
  if (typeof coopAvatar !== 'undefined') coopAvatar.destroy();
  if (typeof coopTrade !== 'undefined') coopTrade.reset();
  coopPartnerLastPos = null;
  // Reset co-op difficulty state
  coopDifficulty = 'normal';
  coopFallMultiplier = 1.5;
  coopScoreMultiplier = 1.8;
  coopBonusBannerTimer = 0;
  const coopBonusEl = document.getElementById('coop-bonus-overlay');
  if (coopBonusEl) coopBonusEl.style.display = 'none';
  // Hide co-op HUD elements
  const coopBadgeEl2 = document.getElementById('coop-mode-badge');
  if (coopBadgeEl2) coopBadgeEl2.style.display = 'none';
  const coopHudEl2 = document.getElementById('coop-score-display');
  if (coopHudEl2) coopHudEl2.style.display = 'none';
  const coopPartnerStatusEl2 = document.getElementById('coop-partner-status');
  if (coopPartnerStatusEl2) coopPartnerStatusEl2.style.display = 'none';
  const coopGoEl = document.getElementById('coop-game-over-screen');
  if (coopGoEl) coopGoEl.style.display = 'none';
  const coopPartnerLeftEl = document.getElementById('coop-partner-left-dialog');
  if (coopPartnerLeftEl) coopPartnerLeftEl.style.display = 'none';

  // Reset daily challenge state
  isDailyChallenge = false;
  isDailyCoopChallenge = false;
  gameRng = null;
  const dailyBadgeEl = document.getElementById('daily-challenge-badge');
  if (dailyBadgeEl) dailyBadgeEl.style.display = 'none';

  // Reset weekly challenge state
  isWeeklyChallenge = false;
  weeklyModifier = null;
  weeklyNoIron = false;
  weeklyGoldRush = false;
  weeklyIceAge = false;
  weeklyDoubleOrNothing = false;
  weeklyBlindDrop = false;
  const weeklyBadgeEl = document.getElementById('weekly-challenge-badge');
  if (weeklyBadgeEl) weeklyBadgeEl.style.display = 'none';

  // Reset battle mode state
  isBattleMode = false;
  battleResult = null;
  battleMatchMode = 'survival';
  battleScoreRaceRemainingMs = 180000;
  battleOpponentScore = 0;
  battleOpponentLines = 0;
  battleGarbageSent = 0;
  battleGarbageReceived = 0;
  battleRubbleMined = 0;
  battleOpponentStats = null;
  if (typeof resetGarbageQueue === 'function') resetGarbageQueue();
  const battleBadgeEl = document.getElementById('battle-mode-badge');
  if (battleBadgeEl) battleBadgeEl.style.display = 'none';
  const battleResultEl = document.getElementById('battle-result-screen');
  if (battleResultEl) battleResultEl.style.display = 'none';
  const battleSrHudEl = document.getElementById('battle-score-race-hud');
  if (battleSrHudEl) battleSrHudEl.style.display = 'none';

  // Reset survival mode state
  isSurvivalMode = false;
  survivalSessionNumber = 1;
  // Restore ground plane visibility (was hidden during Survival mode)
  const _resetGround = worldGroup.children.find(c => c.name === "ground");
  if (_resetGround) _resetGround.visible = true;
  const survivalBadgeEl = document.getElementById('survival-badge');
  if (survivalBadgeEl) survivalBadgeEl.style.display = 'none';
  const survGoEl2 = document.getElementById('survival-go-section');
  if (survGoEl2) survGoEl2.style.display = 'none';
  const goTitleEl2 = document.getElementById('game-over-title');
  if (goTitleEl2) goTitleEl2.textContent = 'GAME OVER';
  const hsLabelEl2 = document.getElementById('hs-go-label');
  if (hsLabelEl2) hsLabelEl2.style.display = '';
  const hsTableEl2 = document.getElementById('hs-go-table');
  if (hsTableEl2) hsTableEl2.style.display = '';

  // Clear expedition biome theme (restores user's cosmetic theme)
  if (typeof clearBiomeTheme === "function") clearBiomeTheme();

  // Reset event engine
  if (typeof resetEventEngine === "function") resetEventEngine();

  // Reset world modifier
  if (typeof resetWorldModifier === 'function') resetWorldModifier();
  const worldModBadgeEl = document.getElementById('world-modifier-badge');
  if (worldModBadgeEl) worldModBadgeEl.style.display = 'none';

  // Reset puzzle mode state
  isPuzzleMode = false;
  puzzlePuzzleId = 1;
  puzzleComplete = false;
  if (typeof resetPuzzleState === "function") resetPuzzleState();
  if (typeof puzzleFixedQueue !== "undefined") puzzleFixedQueue.length = 0;
  if (typeof hidePuzzleSelect === "function") hidePuzzleSelect();

  // Reset custom puzzle mode state
  isCustomPuzzleMode = false;
  customPuzzleWinCondition = null;
  customPlayFromEditor = false;
  const puzzleCompleteEl = document.getElementById("puzzle-complete-screen");
  if (puzzleCompleteEl) puzzleCompleteEl.style.display = "none";
  const puzzleBadgeEl2 = document.getElementById("puzzle-badge");
  if (puzzleBadgeEl2) puzzleBadgeEl2.style.display = "none";

  // Resolve equipped block skin for this session (skin changes take effect on game start).
  if (typeof getEquipped === 'function') {
    const skinCosmetic = getEquipped('block_skin');
    activeBlockSkin = (skinCosmetic && skinCosmetic.assets && skinCosmetic.assets.themeKey !== 'default')
      ? skinCosmetic.assets.themeKey
      : null;
  } else {
    activeBlockSkin = null;
  }

  // Reset next-piece queue
  initPieceQueue();
  if (nextPiecesEl) nextPiecesEl.style.display = "none";

  // Reset mining feedback state
  miningShakeActive = false;
  miningShakeBlock = null;
  dustParticles.forEach((p) => scene.remove(p.mesh));
  dustParticles = [];

  // Reset line-clear state
  lineClearInProgress = false;
  lineClearFlashBlocks = [];
  lineClearPendingYs = [];
  bannerTimer = 0;
  if (lineClearBannerEl) lineClearBannerEl.style.display = "none";

  // Reset combo state
  comboCount = 0;
  lastClearTime = -1;
  comboBannerTimer = 0;
  if (comboBannerEl) comboBannerEl.style.display = "none";
  lastClearWasTetris = false;

  // Reset player
  if (controls) {
    controls.getObject().position.set(0, PLAYER_HEIGHT, 5);
    playerVelocity.set(0, 0, 0);
    playerPushVelocity.set(0, 0, 0);
    screenShakeActive = false;
    playerOnGround = false;
    canJump = false;
    moveForward = moveBackward = moveLeft = moveRight = false;
  }

  // Reset editor mode state
  if (isEditorMode && typeof cleanupEditorMode === "function") cleanupEditorMode();
  isEditorMode = false;
  moveUp = false;
  moveDown = false;
  const editorHudEl = document.getElementById("editor-hud");
  if (editorHudEl) editorHudEl.style.display = "none";

  // Reset game over / pause flags
  isGameOver = false;
  isPaused = false;

  // Hide Game Over and pause screens
  const gameOverEl = document.getElementById("game-over-screen");
  if (gameOverEl) gameOverEl.style.display = "none";
  const pauseScreenEl = document.getElementById("pause-screen");
  if (pauseScreenEl) pauseScreenEl.style.display = "none";

  updateScoreHUD();

  // Return to start screen (hide mode select if it was open)
  const modeSelectEl = document.getElementById("mode-select");
  if (modeSelectEl) modeSelectEl.style.display = "none";
  blocker.style.display = "flex";
  instructions.style.display = "";
  crosshair.style.display = "none";
  if (scoreEl) scoreEl.style.display = "none";
  document.getElementById("inventory-hud").style.display = "none";

  renderHighScoresStart();
}

// Battle mode Level 3 starting multiplier (tier 2 = Math.pow(1.1, 2))
const BATTLE_START_MULTIPLIER = Math.pow(1.1, 2); // ≈ 1.21
const BATTLE_START_TIER = 2; // Display "Level 3" at game start

/**
 * Show battle post-match summary screen (win/loss/draw).
 * Called from checkGameOver (loss), battle opponent-left handler (win), or
 * opponent_game_over message (win). Sets battleResult and isBattleMode = false.
 */
