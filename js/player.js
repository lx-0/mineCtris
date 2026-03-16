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
  if (
    !onSolidGround &&
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

function onKeyDown(event) {
  // When crafting panel is open the pointer is unlocked; still allow C/Escape to close it
  if (craftingPanelOpen) {
    if (event.code === "KeyC" || event.code === "Escape") {
      closeCraftingPanel();
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
      // Crafting is disabled in Sprint, Blitz, and No Iron Week
      if (!isSprintMode && !isBlitzMode && !weeklyNoIron) toggleCraftingPanel();
      break;
    case "KeyQ":
      applyNudge(-1, 0);
      break;
    case "KeyE":
      applyNudge(1, 0);
      break;
    case "KeyZ":
      applyNudge(0, -1);
      break;
    case "KeyX":
      applyNudge(0, 1);
      break;
    case "KeyF":
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
