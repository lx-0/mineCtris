// Falling Tetris pieces — creation, spawning, rotation, and landing.
// Requires: state.js, config.js, world.js (createBlockMesh, registerBlock),
//           lineclear.js (checkLineClear), gamestate.js (checkGameOver)

function createPiece3D(shapeData, colorIndex) {
  const pieceGroup = new THREE.Group();
  const color = COLORS[colorIndex];
  shapeData.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value > 0) {
        const blockMesh = createBlockMesh(color);
        blockMesh.position.set(x * BLOCK_SIZE, -y * BLOCK_SIZE, 0);
        pieceGroup.add(blockMesh);
      }
    });
  });
  pieceGroup.userData.pivotOffset = new THREE.Vector3(
    (shapeData[0].length / 2 - 0.5) * BLOCK_SIZE,
    (-shapeData.length / 2 + 0.5) * BLOCK_SIZE,
    0
  );
  pieceGroup.children.forEach((child) =>
    child.position.sub(pieceGroup.userData.pivotOffset)
  );
  pieceGroup.position.add(pieceGroup.userData.pivotOffset);
  return pieceGroup;
}

function spawnFallingPiece() {
  const index = Math.floor(Math.random() * (SHAPES.length - 1)) + 1;
  const shape = SHAPES[index];
  const piece3D = createPiece3D(shape, index);
  const spawnX = (Math.random() - 0.5) * (WORLD_SIZE * 0.8);
  const spawnZ = (Math.random() - 0.5) * (WORLD_SIZE * 0.8);
  const spawnY = WORLD_SIZE * 0.6;
  piece3D.position.set(spawnX, spawnY, spawnZ);
  piece3D.userData.velocity = new THREE.Vector3(0, -GRAVITY / 4, 0);
  piece3D.userData.colorIndex = index;
  piece3D.userData.timeSinceRotation = 0;
  piece3D.userData.rotationInterval =
    Math.random() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) +
    MIN_ROTATION_INTERVAL;
  fallingPiecesGroup.add(piece3D);
  fallingPieces.push(piece3D);
}

function applyRandomRotation(piece) {
  const axis = Math.floor(Math.random() * 3);
  const angle = Math.PI / 2;
  if (axis === 0) piece.rotateX(angle);
  else if (axis === 1) piece.rotateY(angle);
  else piece.rotateZ(angle);
}

function updateFallingPieces(delta) {
  const landedPieces = [];
  fallingPieces.forEach((piece, i) => {
    piece.userData.timeSinceRotation += delta;
    if (
      piece.userData.timeSinceRotation >= piece.userData.rotationInterval
    ) {
      applyRandomRotation(piece);
      piece.userData.timeSinceRotation = 0;
      piece.userData.rotationInterval =
        Math.random() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) +
        MIN_ROTATION_INTERVAL;
    }
    piece.position.y += piece.userData.velocity.y * delta;
    let lowestPoint = Infinity;
    piece.children.forEach((block) => {
      block.getWorldPosition(
        (block.userData.tempVec =
          block.userData.tempVec || new THREE.Vector3())
      );
      lowestPoint = Math.min(lowestPoint, block.userData.tempVec.y);
    });
    let landed = false;
    if (lowestPoint <= BLOCK_SIZE / 2) {
      piece.position.y += BLOCK_SIZE / 2 - lowestPoint;
      landed = true;
    } else {
      piece.children.forEach((block) => {
        if (landed) return;
        block.getWorldPosition(block.userData.tempVec);
        const blockBottomY = block.userData.tempVec.y - BLOCK_SIZE / 2;
        worldGroup.children.forEach((staticObj) => {
          if (landed || staticObj.name === "ground") return;
          const staticBox = (staticObj.userData.boundingBox =
            staticObj.userData.boundingBox ||
            new THREE.Box3().setFromObject(staticObj));
          const fallingBlockWorldBox = (block.userData.worldBox =
            block.userData.worldBox || new THREE.Box3());
          fallingBlockWorldBox.setFromCenterAndSize(
            block.userData.tempVec,
            (block.userData.sizeVec =
              block.userData.sizeVec ||
              new THREE.Vector3(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE))
          );
          if (fallingBlockWorldBox.intersectsBox(staticBox)) {
            if (blockBottomY <= staticBox.max.y + 0.01) {
              piece.position.y +=
                staticBox.max.y +
                BLOCK_SIZE / 2 -
                block.userData.tempVec.y;
              landed = true;
            }
          }
        });
      });
    }
    if (landed) landedPieces.push(i);
  });
  for (let i = landedPieces.length - 1; i >= 0; i--) {
    const index = landedPieces[i];
    const pieceToLand = fallingPieces[index];
    const newBlocks = [];
    while (pieceToLand.children.length > 0) {
      const block = pieceToLand.children[0];
      block.getWorldPosition(block.userData.tempVec);
      block.getWorldQuaternion(
        (block.userData.tempQuat =
          block.userData.tempQuat || new THREE.Quaternion())
      );
      worldGroup.attach(block);
      block.position.copy(block.userData.tempVec);
      block.quaternion.copy(block.userData.tempQuat);
      block.name = "landed_block";
      registerBlock(block);
      newBlocks.push(block);
    }
    fallingPiecesGroup.remove(pieceToLand);
    fallingPieces.splice(index, 1);
    checkLineClear(newBlocks);
    checkGameOver();
  }
}
