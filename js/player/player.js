// Player — movement collision and keyboard input handlers.
// Requires: state.js, config.js

function checkPlayerCollision(deltaY) {
  playerOnGround = false;
  if (!controls) return false;
  const playerPosition = controls.getObject().position;
  const capsuleHalfHeight = PLAYER_HEIGHT / 2;
  const downRayOrigin = playerPosition.clone();
  const downRaycaster = new THREE.Raycaster(
    downRayOrigin,
    new THREE.Vector3(0, -1, 0),
    0,
    capsuleHalfHeight + 0.1
  );
  const downIntersects = downRaycaster.intersectObjects(
    worldGroup.children,
    true
  );
  let onSolidGround = false;
  if (downIntersects.length > 0) {
    const distance = downIntersects[0].distance;
    if (distance <= capsuleHalfHeight + 0.05) {
      playerVelocity.y = Math.max(0, playerVelocity.y);
      playerPosition.y += capsuleHalfHeight - distance + 0.01;
      onSolidGround = true;
    }
  }
  // Fallback floor at the surface level — skip in Survival mode.
  if (
    !onSolidGround &&
    !isSurvivalMode &&
    playerPosition.y <= capsuleHalfHeight + BLOCK_SIZE / 2
  ) {
    playerVelocity.y = Math.max(0, playerVelocity.y);
    playerPosition.y = capsuleHalfHeight + BLOCK_SIZE / 2;
    onSolidGround = true;
  }
  playerOnGround = onSolidGround;
  if (playerOnGround) {
    canJump = true;
    // Detect ice block underfoot for friction modifier.
    if (downIntersects.length > 0 && downIntersects[0].distance <= capsuleHalfHeight + 0.05) {
      const hitObj = downIntersects[0].object;
      const matType = hitObj.userData.materialType ||
        (hitObj.parent && hitObj.parent.userData.materialType);
      playerStandingOnIce = matType === "ice";
    } else {
      playerStandingOnIce = false;
    }
  } else {
    playerStandingOnIce = false;
  }
  return false;
}

// Hold-C detection for co-op thumbs-up emote
var _cKeyHoldTimeout = null;

function onKeyDown(event) {
  // When crafting panel is open the pointer is unlocked; still allow C/Escape to close it
  if (craftingPanelOpen) {
    if (event.code === "KeyC" || event.code === "Escape") {
      closeCraftingPanel();
    }
    return;
  }
  // When co-op trade panel is open; Escape cancels
  if (typeof coopTradePanelOpen !== 'undefined' && coopTradePanelOpen) {
    if (event.code === "Escape") {
      if (typeof coopTrade !== 'undefined') coopTrade.closePanel();
    }
    return;
  }
  // Allow P to trigger Play Again from the game-over screen
  if (isGameOver && event.code === "KeyP") {
    if (typeof resetGame === "function") resetGame();
    return;
  }
  if (!controls || !controls.isLocked || isGameOver) return;
  switch (event.code) {
    case "KeyW":
      moveForward = true;
      break;
    case "KeyA":
      moveLeft = true;
      break;
    case "KeyS":
      moveBackward = true;
      break;
    case "KeyD":
      moveRight = true;
      break;
    case "Space":
      if (isEditorMode) { moveUp = true; break; }
      if (canJump && playerOnGround) playerVelocity.y += JUMP_VELOCITY;
      canJump = false;
      playerOnGround = false;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      if (isEditorMode) moveDown = true;
      break;
    case "Digit1":
    case "Digit2":
    case "Digit3":
    case "Digit4":
    case "Digit5":
    case "Digit6":
    case "Digit7":
    case "Digit8":
    case "Digit9": {
      const idx = parseInt(event.code.replace("Digit", "")) - 1;
      if (isEditorMode) {
        if (typeof selectEditorBlock === "function") selectEditorBlock(idx);
      } else {
        const entries = Object.entries(inventory).filter(([, n]) => n > 0);
        if (idx < entries.length) selectBlockColor(entries[idx][0]);
      }
      break;
    }
    case "KeyC":
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        // In co-op: hold C for thumbs-up; quick tap still opens crafting (handled on keyup)
        if (!_cKeyHoldTimeout) {
          _cKeyHoldTimeout = setTimeout(function () {
            _cKeyHoldTimeout = null;
            coopEmote.sendEmote('thumbsup');
          }, 400);
        }
        break;
      }
      // Non-coop: crafting is disabled in Sprint, Blitz, and No Iron Week
      if (!isSprintMode && !isBlitzMode && !weeklyNoIron) toggleCraftingPanel();
      break;
    case "KeyQ":
      // Reject incoming trade offer if one is pending
      if (isCoopMode && typeof coopTrade !== 'undefined' && coopTrade.hasPendingIncomingOffer()) {
        coopTrade.rejectIncomingOffer();
        break;
      }
      applyNudge(-1, 0);
      break;
    case "KeyE":
      // Accept incoming trade offer if one is pending
      if (isCoopMode && typeof coopTrade !== 'undefined' && coopTrade.hasPendingIncomingOffer()) {
        coopTrade.acceptIncomingOffer();
        break;
      }
      applyNudge(1, 0);
      break;
    case "KeyZ":
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        coopEmote.sendEmote('wave');
        break;
      }
      applyNudge(0, -1);
      break;
    case "KeyX":
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        coopEmote.sendEmote('point');
        break;
      }
      applyNudge(0, 1);
      break;
    case "KeyV":
      if (isCoopMode && typeof coopEmote !== 'undefined') {
        coopEmote.sendEmote('alert');
      }
      break;
    case "KeyF":
      // Co-op trade takes priority (not in puzzle mode)
      if (isCoopMode && !isPuzzleMode && typeof coopTrade !== 'undefined') {
        if (coopTrade.tryOpenPanel()) break;
      }
      if (isPuzzleMode) {
        if (typeof setThinkMode === "function") setThinkMode(true);
      } else if (equippedPowerUpType) {
        if (typeof activateEquippedPowerup === "function") activateEquippedPowerup();
      } else {
        if (typeof activateLavaFlask === "function") activateLavaFlask();
      }
      break;
    case "KeyG":
      if (typeof activateIceBridge === "function") activateIceBridge();
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case "KeyC":
      // Co-op: if hold timer is still pending it was a quick tap → open crafting
      if (isCoopMode && _cKeyHoldTimeout) {
        clearTimeout(_cKeyHoldTimeout);
        _cKeyHoldTimeout = null;
        if (!isSprintMode && !isBlitzMode && !weeklyNoIron) toggleCraftingPanel();
      }
      break;
    case "KeyW":
      moveForward = false;
      break;
    case "KeyA":
      moveLeft = false;
      break;
    case "KeyS":
      moveBackward = false;
      break;
    case "KeyD":
      moveRight = false;
      break;
    case "Space":
      if (isEditorMode) { moveUp = false; break; }
      canJump = true;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      moveDown = false;
      break;
    case "KeyF":
      if (isPuzzleMode && typeof setThinkMode === "function") setThinkMode(false);
      break;
  }
}
