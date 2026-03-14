// Line-clear mechanic — detection, flash animation, and block removal.
// Requires: state.js, config.js, world.js (unregisterBlock), audio.js (playLineClearSound),
//           gamestate.js (addScore) — gamestate.js must be loaded before lineclear.js.

/**
 * Called after each piece lands with the array of newly landed blocks.
 * Checks their Y-levels for completeness and starts a clear if needed.
 */
function checkLineClear(newBlocks) {
  if (lineClearInProgress) return;
  const ySet = new Set();
  newBlocks.forEach((b) => {
    if (b.userData.gridPos) ySet.add(b.userData.gridPos.y);
  });
  const completeLevels = [];
  ySet.forEach((gy) => {
    const layer = gridOccupancy.get(gy);
    if (layer && layer.size >= LINE_CLEAR_CELLS_NEEDED)
      completeLevels.push(gy);
  });
  if (!completeLevels.length) return;

  completeLevels.sort((a, b) => a - b);

  // Collect all blocks on complete levels and start flash animation.
  lineClearFlashBlocks = [];
  worldGroup.children.forEach((obj) => {
    if (obj.name !== "landed_block" || !obj.userData.gridPos) return;
    if (completeLevels.includes(obj.userData.gridPos.y)) {
      obj.userData._savedColor = obj.material.color.clone();
      obj.material.color.set(0xffffff);
      obj.material.emissive = new THREE.Color(0xaaaaaa);
      obj.material.needsUpdate = true;
      lineClearFlashBlocks.push(obj);
    }
  });

  lineClearPendingYs = completeLevels;
  lineClearFlashStart = clock.getElapsedTime();
  lineClearInProgress = true;

  playLineClearSound(completeLevels.length);

  // Award score: 100 / 300 / 500 / 800 for 1 / 2 / 3 / 4 lines.
  const LINE_SCORES = [0, 100, 300, 500, 800];
  linesCleared += completeLevels.length;
  addScore(LINE_SCORES[Math.min(completeLevels.length, 4)]);

  // Show banner
  if (lineClearBannerEl) {
    const labels = ["", "LINE CLEAR!", "DOUBLE!", "TRIPLE!", "TETRIS!"];
    lineClearBannerEl.textContent =
      labels[Math.min(completeLevels.length, 4)];
    lineClearBannerEl.style.display = "block";
    bannerTimer = 1.2; // seconds to show
  }
}

/**
 * Must be called every frame. Drives the flash animation and, when it
 * finishes, removes cleared blocks and applies downward gravity to
 * everything above.
 */
function updateLineClear(delta) {
  // Tick banner timer
  if (bannerTimer > 0) {
    bannerTimer -= delta;
    if (bannerTimer <= 0 && lineClearBannerEl) {
      lineClearBannerEl.style.display = "none";
    }
  }

  if (!lineClearInProgress) return;

  const elapsed = clock.getElapsedTime() - lineClearFlashStart;
  const flashOn =
    Math.floor((elapsed / LINE_CLEAR_FLASH_SECS) * 8) % 2 === 0;
  lineClearFlashBlocks.forEach((b) => {
    if (flashOn) {
      b.material.color.set(0xffffff);
      b.material.emissive.set(0xaaaaaa);
    } else {
      if (b.userData._savedColor)
        b.material.color.copy(b.userData._savedColor);
      b.material.emissive.set(0x000000);
    }
    b.material.needsUpdate = true;
  });

  if (elapsed < LINE_CLEAR_FLASH_SECS) return;

  // Flash done — remove cleared blocks.
  lineClearFlashBlocks.forEach((b) => {
    unregisterBlock(b);
    worldGroup.remove(b);
  });
  lineClearFlashBlocks = [];

  const clearedYs = lineClearPendingYs;
  lineClearPendingYs = [];

  // Shift all surviving blocks above cleared levels down.
  const toShift = [];
  worldGroup.children.forEach((obj) => {
    if (obj.name !== "landed_block" || !obj.userData.gridPos) return;
    const origY = obj.userData.gridPos.y;
    const drop = clearedYs.filter((y) => y < origY).length;
    if (drop) toShift.push({ obj, origY, drop });
  });
  toShift.forEach(({ obj, origY, drop }) => {
    const newY = origY - drop;
    const key = obj.userData.gridPos.x + "," + obj.userData.gridPos.z;
    const old = gridOccupancy.get(origY);
    if (old) {
      old.delete(key);
      if (!old.size) gridOccupancy.delete(origY);
    }
    if (!gridOccupancy.has(newY)) gridOccupancy.set(newY, new Set());
    gridOccupancy.get(newY).add(key);
    obj.userData.gridPos.y = newY;
    obj.position.y -= drop * BLOCK_SIZE;
  });

  // Invalidate cached bounding boxes so collision detection stays correct.
  worldGroup.children.forEach((o) => {
    o.userData.boundingBox = null;
  });

  lineClearInProgress = false;
}
