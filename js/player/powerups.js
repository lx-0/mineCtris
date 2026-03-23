// Power-up activation logic and HUD management.
// Requires: state.js, core/gamestate.js loaded first.

/**
 * Find a landed block at the given grid coordinates (integer X/Y/Z).
 * Only searches blocks that have a valid gridPos.
 */
function _findBlockAtGrid(gx, gy, gz) {
  for (let i = 0; i < worldGroup.children.length; i++) {
    const child = worldGroup.children[i];
    const gp = child.userData.gridPos;
    if (gp && gp.x === gx && gp.y === gy && gp.z === gz) return child;
  }
  return null;
}

/**
 * Mine up to 4 adjacent blocks (N/S/E/W same Y) when diamond pickaxe breaks a block.
 * @param {{ x:number, y:number, z:number }} origin  The grid position of the primary broken block.
 */
function _applyDiamondAOE(origin) {
  const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
  offsets.forEach(([dx, dz]) => {
    const neighbor = _findBlockAtGrid(origin.x + dx, origin.y, origin.z + dz);
    if (!neighbor) return;
    spawnDustParticles(neighbor, { breakBurst: true });
    blocksMined++;
    if (isCoopMode) coopMyBlocksMined++;
    const nobjType = neighbor.userData.objectType;
    const nmatName = neighbor.userData.materialType ||
      (nobjType ? OBJECT_TYPE_TO_MATERIAL[nobjType] : null);
    addScore(nmatName && BLOCK_TYPES[nmatName] ? BLOCK_TYPES[nmatName].points : 10);
    if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, nobjType);
    if (typeof onMissionBlockMined === "function") onMissionBlockMined();
    const nColor = neighbor.userData.originalColor || neighbor.material.color;
    addToInventory(threeColorToCss(nColor));
    unregisterBlock(neighbor);
    disposeBlock(neighbor);
    worldGroup.remove(neighbor);
  });
}

/**
 * Lava Flask activation: removes all blocks on the lowest occupied Y layer.
 * Activated via keyboard shortcut F.
 */
function activateLavaFlask() {
  if (!controls || !controls.isLocked || isGameOver) return;
  if (!consumables.lava_flask || consumables.lava_flask <= 0) return;
  // Find the lowest non-empty Y layer
  let lowestY = Infinity;
  for (const gy of gridOccupancy.keys()) {
    if (gy < lowestY) lowestY = gy;
  }
  if (!isFinite(lowestY)) return;

  consumables.lava_flask--;
  showCraftedBanner("Lava Flask! Layer destroyed.");

  // Collect all blocks at lowestY and remove them
  const toRemove = worldGroup.children.filter(c => {
    const gp = c.userData.gridPos;
    return gp && gp.y === lowestY;
  });
  toRemove.forEach(block => {
    spawnDustParticles(block, { breakBurst: true });
    blocksMined++;
    if (isCoopMode) coopMyBlocksMined++;
    const oType = block.userData.objectType;
    const mName = block.userData.materialType || (oType ? OBJECT_TYPE_TO_MATERIAL[oType] : null);
    addScore(mName && BLOCK_TYPES[mName] ? BLOCK_TYPES[mName].points : 10);
    unregisterBlock(block);
    disposeBlock(block);
    worldGroup.remove(block);
  });
  if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, undefined);
  // Mission: count lava-flask-destroyed blocks
  if (typeof onMissionBlockMined === "function") {
    for (let _i = 0; _i < toRemove.length; _i++) onMissionBlockMined();
  }
  if (typeof onMissionPowerupActivated === "function") onMissionPowerupActivated();
}

/**
 * Ice Bridge activation: slows all falling pieces by 20% for 10 seconds.
 * Activated via keyboard shortcut G.
 */
function activateIceBridge() {
  if (!controls || !controls.isLocked || isGameOver) return;
  if (!consumables.ice_bridge || consumables.ice_bridge <= 0) return;
  consumables.ice_bridge--;
  iceBridgeSlowActive = true;
  iceBridgeSlowTimer  = 10.0;
  showCraftedBanner("Ice Bridge! 20% slow for 10s.");
  if (typeof onMissionPowerupActivated === "function") onMissionPowerupActivated();
}

/**
 * Trigger a one-shot activation flash for the given power-up type.
 * @param {"row-bomb"|"slow-down"|"shield"|"magnet"|"time-freeze"} type
 */
function _triggerPowerupFlash(type) {
  const el = document.getElementById("powerup-flash");
  if (!el) return;
  // Reset animation by forcing reflow
  el.style.display = "none";
  el.className = "";
  void el.offsetWidth; // reflow
  el.className = type + " active";
  el.style.display = "block";
  el.addEventListener("animationend", function onEnd() {
    el.style.display = "none";
    el.className = "";
    el.removeEventListener("animationend", onEnd);
  }, { once: true });
}

/**
 * Trigger a brief red lightning-strike flash on piece spawn during Piece Storm.
 * Resets the CSS animation each call by forcing a reflow.
 */
function triggerLightningFlash() {
  const el = document.getElementById("lightning-flash");
  if (!el) return;
  el.style.display = "none";
  el.classList.remove("active");
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add("active");
  el.style.display = "block";
  el.addEventListener("animationend", function onEnd() {
    el.style.display = "none";
    el.classList.remove("active");
    el.removeEventListener("animationend", onEnd);
  }, { once: true });
}


/**
 * Apply or remove blue-white emissive glow on all currently falling pieces.
 * Called when Time Freeze activates or expires.
 * @param {boolean} on  true = apply glow, false = restore default emissive
 */
function _applyTimeFreezeGlow(on) {
  fallingPieces.forEach(function (piece) {
    piece.children.forEach(function (block) {
      if (!block.material) return;
      if (on) {
        block.material.emissive.setRGB(0.55, 0.85, 1.0);
      } else {
        block.material.emissive.setRGB(0, 0, 0);
      }
      block.material.needsUpdate = true;
    });
  });
}

/** Show/hide persistent power-up overlays based on current effect state. */
function updatePowerupOverlays() {
  const sdEl = document.getElementById("slowdown-overlay");
  const shEl = document.getElementById("shield-overlay");
  const mgEl = document.getElementById("magnet-overlay");
  const tfEl = document.getElementById("time-freeze-overlay");
  if (sdEl) sdEl.style.display = (!isGameOver && slowDownActive) ? "block" : "none";
  if (shEl && !shEl.classList.contains("absorb")) {
    shEl.style.display = (!isGameOver && shieldActive) ? "block" : "none";
  }
  if (mgEl) mgEl.style.display = (!isGameOver && magnetActive) ? "block" : "none";
  if (tfEl) tfEl.style.display = (!isGameOver && timeFreezeActive) ? "block" : "none";
}

/** Update the equipped power-up HUD badge visibility and used state. */
function updatePowerupHUD() {
  const hudEl = document.getElementById("powerup-hud");
  if (!hudEl) return;
  if (!equippedPowerUpType) {
    hudEl.style.display = "none";
    return;
  }
  const puDefs = {
    row_bomb:   { icon: "\uD83D\uDCA3", name: "Row Bomb"    },
    slow_down:  { icon: "\u23F1",        name: "Slow Down"  },
    shield:     { icon: "\uD83D\uDEE1",  name: "Shield"     },
    magnet:     { icon: "\uD83E\uDDF2",  name: "Magnet"     },
    time_freeze: { icon: "\u2744",       name: "Time Freeze" },
    sabotage:   { icon: "\uD83D\uDCA5",  name: "Sabotage"   },
    counter:    { icon: "\uD83D\uDEE1\u2194",  name: "Counter"    },
    fortress:   { icon: "\uD83D\uDEE1\u26EA", name: "Fortress"   },
  };
  const def = puDefs[equippedPowerUpType];
  if (!def) { hudEl.style.display = "none"; return; }
  const bank = loadPowerUpBank();
  const qty  = bank[equippedPowerUpType] || 0;
  hudEl.style.display = "flex";
  const iconEl = document.getElementById("powerup-hud-icon");
  const nameEl = document.getElementById("powerup-hud-name");
  if (iconEl) {
    iconEl.textContent = def.icon;
    iconEl.classList.toggle("pu-used", qty <= 0);
  }
  if (nameEl) nameEl.textContent = def.name + (qty > 0 ? " \xD7" + qty : " (used)");
}

/**
 * Activate the currently equipped power-up.
 * Called via the F key (when a power-up is equipped) or directly.
 */
function activateEquippedPowerup() {
  if (!controls || !controls.isLocked || isGameOver) return;
  if (!equippedPowerUpType) return;
  const bank = loadPowerUpBank();
  if ((bank[equippedPowerUpType] || 0) <= 0) return;

  // Consume one from the bank
  bank[equippedPowerUpType]--;
  savePowerUpBank(bank);
  // Also decrement in-session inventory (kept in sync)
  if (powerUps[equippedPowerUpType] > 0) powerUps[equippedPowerUpType]--;

  switch (equippedPowerUpType) {
    case "row_bomb": {
      let lowestY = Infinity;
      for (const gy of gridOccupancy.keys()) {
        if (gy < lowestY) lowestY = gy;
      }
      if (!isFinite(lowestY)) break;
      showCraftedBanner("Row Bomb! Row cleared.");
      const toRemove = worldGroup.children.filter(function (c) {
        const gp = c.userData.gridPos;
        return gp && gp.y === lowestY;
      });
      toRemove.forEach(function (block) {
        spawnDustParticles(block, { breakBurst: true });
        blocksMined++;
        if (isCoopMode) coopMyBlocksMined++;
        const oType = block.userData.objectType;
        const mName = block.userData.materialType || (oType ? OBJECT_TYPE_TO_MATERIAL[oType] : null);
        addScore(mName && BLOCK_TYPES[mName] ? BLOCK_TYPES[mName].points : 10);
        unregisterBlock(block);
        disposeBlock(block);
        worldGroup.remove(block);
      });
      if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, undefined);
      _triggerPowerupFlash("row-bomb");
      triggerChromaticAberration(0.008, 0.45);
      break;
    }
    case "slow_down": {
      slowDownActive = true;
      slowDownTimer  = 60.0;
      showCraftedBanner("Slow Down! 50% speed for 60s.");
      _triggerPowerupFlash("slow-down");
      break;
    }
    case "shield": {
      shieldActive = true;
      showCraftedBanner("Shield active! Next death absorbed.");
      _triggerPowerupFlash("shield");
      break;
    }
    case "magnet": {
      magnetActive      = true;
      magnetTimer       = 30.0;
      magnetLastPullTime = 0.0;
      showCraftedBanner("Magnet! Auto-mining nearby blocks for 30s.");
      _triggerPowerupFlash("magnet");
      break;
    }
    case "time_freeze": {
      if (timeFreezeActive) {
        // Re-activation while active extends by 2s (no full reset)
        timeFreezeTimer += 2.0;
        showCraftedBanner("Time Freeze extended! +" + timeFreezeTimer.toFixed(0) + "s remaining.");
        // Don't consume from bank for extend — refund the decrement above
        bank[equippedPowerUpType]++;
        savePowerUpBank(bank);
        if (powerUps[equippedPowerUpType] < (bank[equippedPowerUpType] || 0)) powerUps[equippedPowerUpType]++;
      } else {
        timeFreezeActive = true;
        timeFreezeTimer  = 5.0;
        showCraftedBanner("Time Freeze! Pieces frozen for 5s.");
        _applyTimeFreezeGlow(true);
        _triggerPowerupFlash("time-freeze");
      }
      break;
    }
    case "sabotage": {
      // Send 2 extra garbage rows to opponent immediately
      if (isBattleMode && typeof battle !== 'undefined' && battle.state === BattleState.IN_GAME) {
        const _saboSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
        battle.send({ type: 'battle_attack', lines: 2, gapSeed: _saboSeed });
        battleGarbageSent += 2;
        if (typeof battleHud !== 'undefined') battleHud.showOutgoingAttack(2);
      }
      showCraftedBanner("Sabotage! 2 garbage rows sent.");
      _triggerPowerupFlash("sabotage");
      // Red edge-flash on local screen
      (function () {
        const el = document.getElementById("lc-flash-overlay");
        if (el) {
          el.style.backgroundColor = "#ff2200";
          el.style.transition = "none";
          el.style.opacity = "0.35";
          void el.offsetHeight;
          el.style.transition = "opacity 0.5s ease-out";
          el.style.opacity = "0";
        }
      }());
      break;
    }
    case "counter": {
      counterActive = true;
      showCraftedBanner("Counter active! Next attack reflected.");
      _triggerPowerupFlash("counter");
      break;
    }
    case "fortress": {
      fortressActive = true;
      fortressTimer  = 5.0;
      showCraftedBanner("Fortress! Garbage blocked for 5s.");
      _triggerPowerupFlash("fortress");
      break;
    }
  }

  // Notify spectators of power-up activation in battle mode
  if (isBattleMode && typeof battle !== 'undefined' && battle.state === BattleState.IN_GAME) {
    battle.send({ type: 'battle_powerup', powerUp: equippedPowerUpType });
  }

  updatePowerupHUD();
  if (typeof onMissionPowerupActivated === "function") onMissionPowerupActivated();
}

