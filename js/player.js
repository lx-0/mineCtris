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
  if (playerOnGround) canJump = true;
  return false;
}

function onKeyDown(event) {
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
      if (canJump && playerOnGround) playerVelocity.y += JUMP_VELOCITY;
      canJump = false;
      playerOnGround = false;
      break;
    case "Digit1":
    case "Digit2":
    case "Digit3":
    case "Digit4":
    case "Digit5":
    case "Digit6":
    case "Digit7": {
      const idx = parseInt(event.code.replace("Digit", "")) - 1;
      const entries = Object.entries(inventory).filter(([, n]) => n > 0);
      if (idx < entries.length) selectBlockColor(entries[idx][0]);
      break;
    }
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
      canJump = true;
      break;
  }
}
