// Player input handlers — wheel zoom, block placement, mouse clicks.
// Requires: state.js, world/mining.js, player/crafting.js loaded first.

function onWheel(event) {
  if (!controls || !controls.isLocked || isGameOver) return;
  cycleSelectedBlock(event.deltaY > 0 ? 1 : -1);
}

function placeBlock() {
  const selectedColor = getSelectedColor();
  if (!selectedColor) return;

  let placeX, placeY, placeZ;
  if (targetedBlock && targetedFaceNormal) {
    // Place adjacent to the targeted block face
    const blockPos = new THREE.Vector3();
    targetedBlock.getWorldPosition(blockPos);
    placeX = snapGrid(blockPos.x + targetedFaceNormal.x * BLOCK_SIZE);
    placeY = snapGridY(blockPos.y + targetedFaceNormal.y * BLOCK_SIZE);
    placeZ = snapGrid(blockPos.z + targetedFaceNormal.z * BLOCK_SIZE);
  } else if (groundPlacementPoint) {
    // Place directly on the ground at the aimed point
    placeX = snapGrid(groundPlacementPoint.x);
    placeY = 0.5;
    placeZ = snapGrid(groundPlacementPoint.z);
  } else {
    return;
  }

  // Cannot place underground
  if (placeY < 0.5) return;

  // Cannot place on occupied cell
  const layer = gridOccupancy.get(placeY);
  if (layer && layer.has(placeX + "," + placeZ)) return;

  // Cannot place inside the player
  if (controls) {
    const pp = controls.getObject().position;
    const dx = Math.abs(placeX - pp.x);
    const dz = Math.abs(placeZ - pp.z);
    const dy = Math.abs(placeY - pp.y);
    if (
      dx < PLAYER_RADIUS + 0.5 &&
      dz < PLAYER_RADIUS + 0.5 &&
      dy < PLAYER_HEIGHT / 2 + 0.5
    )
      return;
  }

  // Consume one block from inventory
  inventory[selectedColor]--;
  if (inventory[selectedColor] <= 0) {
    delete inventory[selectedColor];
    selectedBlockColor = null; // getSelectedColor() will auto-pick next
  }

  // Create and register the placed block
  const threeColor = new THREE.Color(selectedColor);
  const block = createBlockMesh(threeColor);
  block.name = "landed_block";
  block.position.set(placeX, placeY, placeZ);
  worldGroup.add(block);
  registerBlock(block);
  blocksPlaced++;
  if (typeof achOnBlockPlaced === "function") achOnBlockPlaced(blocksPlaced);
  // Co-op: broadcast block placement to partner
  if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
    const _coopGp = block.userData.gridPos;
    if (_coopGp) {
      coop.send({ type: 'world', action: 'place', pos: [_coopGp.x, _coopGp.y, _coopGp.z], color: block.userData.canonicalColor });
    }
  }

  // Update HUD and check line-clear
  updateInventoryHUD();
  checkLineClear([block]);

  // Placement sound
  playPlaceSound();
  if (typeof tutorialNotify === "function") tutorialNotify("blockPlace");
  if (typeof coachMarkBlockPlacement === 'function') coachMarkBlockPlacement();
  if (typeof gameTooltipDismiss === 'function') gameTooltipDismiss();
}

function onMouseDown(event) {
  if (!controls || !controls.isLocked || isGameOver) return;
  // ── Editor mode: left-click places, right-click erases ───────────────────
  if (isEditorMode) {
    if (event.button === 0) {
      if (typeof editorPlaceBlock === "function") editorPlaceBlock();
    } else if (event.button === 2) {
      if (typeof editorEraseBlock === "function") editorEraseBlock();
    }
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────
  if (event.button === 2) {
    placeBlock();
    return;
  }
  if (event.button !== 0) return;
  // ── Creeper mining: click to deal damage / defuse ──────────────────────────
  if (targetedBlock && targetedBlock.userData.isCreeper && typeof damageCreeperMesh === "function") {
    damageCreeperMesh(targetedBlock);
    // If the creeper was destroyed, clear the target
    if (!creeperActive || _creeperHP <= 0) {
      unhighlightTarget();
      targetedBlock = null;
      miningProgress = 0;
      crosshair.classList.remove("target-locked");
    }
    return;
  }
  // ───────────────────────────────────────────────────────────────────────────
  if (targetedBlock) {
    // Void blocks cannot be mined — reject click
    if (typeof isVoidBlock === 'function' && isVoidBlock(targetedBlock)) {
      // Visual feedback: brief purple flash
      if (targetedBlock.material) {
        targetedBlock.material.emissive.setRGB(0.4, 0, 0.6);
        targetedBlock.material.needsUpdate = true;
        setTimeout(function () {
          if (targetedBlock && targetedBlock.material && targetedBlock.userData.defaultEmissive) {
            targetedBlock.material.emissive.copy(targetedBlock.userData.defaultEmissive);
            targetedBlock.material.needsUpdate = true;
          }
        }, 150);
      }
      return;
    }
    // Bedrock cannot be mined — reject click with brief gray flash
    if (targetedBlock.userData.isBedrock) {
      if (targetedBlock.material) {
        targetedBlock.material.emissive.setRGB(0.3, 0.3, 0.3);
        targetedBlock.material.needsUpdate = true;
        setTimeout(function () {
          if (targetedBlock && targetedBlock.material) {
            targetedBlock.material.emissive.setRGB(0, 0, 0);
            targetedBlock.material.needsUpdate = true;
          }
        }, 150);
      }
      return;
    }
    miningProgress++;
    console.log(
      `Mining progress on block: ${miningProgress}/${MINING_CLICKS_NEEDED}`
    );
    let clicksNeeded = targetedBlock.userData.miningClicks || MINING_CLICKS_NEEDED;
    if (pickaxeTier === "stone") clicksNeeded = Math.min(clicksNeeded, 2);
    else if (pickaxeTier === "iron" || pickaxeTier === "diamond") clicksNeeded = 1;
    // Obsidian Pickaxe: -1 hit to all blocks (min 1), stacks with Earthquake
    if (obsidianPickaxeActive) clicksNeeded = Math.max(1, clicksNeeded - 1);
    // Earthquake bonus: halve all hit requirements (rounded down, minimum 1)
    if (earthquakeActive) clicksNeeded = Math.max(1, Math.floor(clicksNeeded / 2));
    isMining = true;
    miningAnimStartTime = clock.getElapsedTime();
    updateMaterialTooltip();
    applyMineDamage(targetedBlock, miningProgress, clicksNeeded);
    startMiningShake(targetedBlock);
    const objType = targetedBlock.userData.objectType;
    const isBreak = miningProgress >= clicksNeeded;

    // Per-material hit sound (played even on the breaking hit)
    if (targetedBlock.userData.isRubble) {
      playRubbleHitSound();
    } else {
      playHitSound(objType);
    }

    if (!isBreak) {
      // Normal hit particles (rubble gets orange crack particles)
      spawnDustParticles(targetedBlock);
      // Trunk: tilt toward player on hit 3 of 4
      if (objType === "trunk" && miningProgress === 3) {
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        const blkPos = new THREE.Vector3();
        targetedBlock.getWorldPosition(blkPos);
        const blockToPlayer = new THREE.Vector3(
          camPos.x - blkPos.x, 0, camPos.z - blkPos.z
        ).normalize();
        const tiltAxis = new THREE.Vector3()
          .crossVectors(new THREE.Vector3(0, 1, 0), blockToPlayer)
          .normalize();
        const tiltAngle = (5 + Math.random() * 3) * Math.PI / 180;
        targetedBlock.rotateOnWorldAxis(tiltAxis, tiltAngle);
        targetedBlock.userData.isTilted = true;
      }
      // Rock: show fracture emissive on hit 3 of 5
      if (objType === "rock" && miningProgress === 3 && targetedBlock.material) {
        targetedBlock.material.emissive = new THREE.Color(0x220000);
        targetedBlock.material.needsUpdate = true;
        targetedBlock.userData.fractured = true;
      }
    }

    if (isBreak) {
      console.log("Block broken!");
      if (typeof tutorialNotify === "function") tutorialNotify("blockMine");
      if (typeof gameTooltipDismiss === 'function') gameTooltipDismiss();

      const _isRubble = targetedBlock.userData.isRubble;

      // Per-material break sound
      if (_isRubble) {
        playRubbleBreakSound();
      } else {
        playBreakSound(objType);
      }
      // Break burst particles (rubble gets orange crack burst)
      spawnDustParticles(targetedBlock, { breakBurst: true });
      blocksMined++;
      if (isCoopMode) coopMyBlocksMined++;
      if (isBattleMode && _isRubble) {
        battleRubbleMined++;
        if (typeof onMissionBattleRubbleMined === 'function') onMissionBattleRubbleMined();
      }
      const _objType = targetedBlock.userData.objectType;
      const _matName = targetedBlock.userData.materialType ||
        (_objType ? OBJECT_TYPE_TO_MATERIAL[_objType] : null);
      addScore(_matName && BLOCK_TYPES[_matName] ? BLOCK_TYPES[_matName].points : 10);
      if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, _objType);
      if (typeof onMissionBlockMined === "function") onMissionBlockMined();
      // Save grid pos for diamond AOE (before block is removed from world)
      const _brokenBlock = pickaxeTier === "diamond" ? (targetedBlock.userData.gridPos
        ? { x: targetedBlock.userData.gridPos.x, y: targetedBlock.userData.gridPos.y, z: targetedBlock.userData.gridPos.z }
        : null) : null;

      // ── Rubble mining drop: 50/50 stone or dirt ─────────────────────────────
      if (_isRubble) {
        const _rubbleDropColor = Math.random() < 0.5 ? '#808080' : '#8b4513';
        const collected = addToInventory(_rubbleDropColor);
        if (!collected) {
          console.log("Inventory full — rubble drop discarded.");
        }
      } else {
        const blockColor =
          targetedBlock.userData.originalColor ||
          targetedBlock.material.color;
        const cssColor = threeColorToCss(blockColor);
        // Use the dropMaterial color if defined (e.g. obsidian → obsidian_shard)
        const _matType = targetedBlock.userData.materialType;
        const _dropMat = _matType && BLOCK_TYPES[_matType] && BLOCK_TYPES[_matType].dropMaterial;
        const _invColor = _dropMat === "obsidian_shard" ? OBSIDIAN_SHARD_COLOR : cssColor;
        const crumbles = targetedBlock.name === "leaf_block" && Math.random() < 0.2;
        if (!crumbles) {
          const collected = addToInventory(_invColor);
          if (!collected) {
            console.log("Inventory full — block discarded.");
          }

        }
      }

      if (miningShakeBlock === targetedBlock) {
        miningShakeActive = false;
        miningShakeBlock = null;
      }

      // Queue tree respawn when a trunk is felled
      if (targetedBlock.name === "trunk_block" && treeRespawnQueue.length < 15) {
        treeRespawnQueue.push({
          x: targetedBlock.position.x,
          z: targetedBlock.position.z,
          timer: 90,
          growing: false,
          growStart: 0,
          meshes: null,
        });
      }

      // Co-op: broadcast block break to partner (capture gridPos before unregister clears it)
      if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
        const _coopGp = targetedBlock.userData.gridPos;
        if (_coopGp) {
          coop.send({ type: 'world', action: 'break', pos: [_coopGp.x, _coopGp.y, _coopGp.z] });
        }
      }

      // Save rubble row Y before unregistering (used for full-row check below)
      const _rubbleRowY = _isRubble && targetedBlock.userData.gridPos
        ? targetedBlock.userData.gridPos.y : null;

      unregisterBlock(targetedBlock);
      disposeBlock(targetedBlock);
      worldGroup.remove(targetedBlock);

      // Remove from obsidian shimmer tracking if applicable
      const _obIdx = obsidianBlocks.indexOf(targetedBlock);
      if (_obIdx !== -1) obsidianBlocks.splice(_obIdx, 1);

      // ── Rubble row fully cleared → cancel one pending garbage attack ────────
      if (isBattleMode && _isRubble && _rubbleRowY !== null
          && typeof cancelOnePendingGarbage === 'function') {
        // Check if any rubble blocks remain at this Y level
        const _rubbleRemaining = worldGroup.children.some(function (obj) {
          return obj.name === 'landed_block'
            && obj.userData.isRubble
            && obj.userData.gridPos
            && obj.userData.gridPos.y === _rubbleRowY;
        });
        if (!_rubbleRemaining) {
          cancelOnePendingGarbage();
          console.log('Rubble row fully mined — cancelled one pending garbage attack.');
        }
      }

      // Diamond Pickaxe AOE — mine up to 4 adjacent blocks in a cross pattern
      if (pickaxeTier === "diamond" && _brokenBlock) {
        _applyDiamondAOE(_brokenBlock);
      }
      // Puzzle / custom puzzle mode: check win/lose after every mined block
      if ((isPuzzleMode || isCustomPuzzleMode) && typeof checkPuzzleConditions === "function") {
        checkPuzzleConditions();
      }
      targetedBlock = null;
      miningProgress = 0;
      crosshair.classList.remove("target-locked");
      isMining = false;
      if (pickaxeGroup) pickaxeGroup.rotation.z = Math.PI / 8;
    }
  }
}

