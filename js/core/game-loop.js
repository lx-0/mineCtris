// Main animation loop — called by init(), drives all per-frame updates.
// Requires: all other modules loaded first (loaded as part of main.js).

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();
  const rawDelta = clock.getDelta();
  // Cap delta to prevent timer skips after pause/tab-away (THREE.Clock accumulates real time)
  const delta = Math.min(rawDelta, 0.1);
  const elapsedTime = clock.getElapsedTime();

  updateSky(elapsedTime, delta);

  if (!isGameOver && !isPaused) {
    // Tick the sprint timer (starts only once the first piece begins falling)
    if (isSprintMode && sprintTimerActive && !sprintComplete) {
      sprintElapsedMs += delta * 1000;
    }

    // Tick the blitz countdown timer
    if (isBlitzMode && blitzTimerActive && !blitzComplete) {
      blitzRemainingMs -= delta * 1000;
      if (blitzRemainingMs <= 0) {
        blitzRemainingMs = 0;
        if (typeof triggerBlitzComplete === "function") triggerBlitzComplete();
      } else if (!blitzBonusActive && blitzRemainingMs <= BLITZ_BONUS_THRESHOLD_MS) {
        // Activate Blitz bonus for final 30 seconds
        blitzBonusActive = true;
        // Show visual cue via speed-up banner
        if (speedUpBannerEl) {
          speedUpBannerEl.textContent = "⚡ BLITZ BONUS! 2.0×";
          speedUpBannerEl.style.color = "#ffd700";
          speedUpBannerEl.style.display = "block";
          speedUpBannerTimer = 2.5;
        }
        updateScoreHUD();
      }
    }

    // Update environmental soundscapes based on biome
    if (typeof updateEnvironmentalAudio === 'function') {
      var _envBiome = (typeof activeBiomeId !== 'undefined') ? activeBiomeId : null;
      updateEnvironmentalAudio(_envBiome, 0);
    }

    // ── Ambient mood decision — maps game state to audio mood ──────────────
    if (typeof setAmbientMood === 'function' && typeof getMaxBlockHeight === 'function') {
      var _heightRatio = getMaxBlockHeight() / GAME_OVER_HEIGHT;
      var _bossActive = (typeof getBossState === 'function') &&
        (getBossState() === 'active' || getBossState() === 'intro' || getBossState() === 'transition');
      var _stormActive = (typeof pieceStormActive !== 'undefined') && pieceStormActive;
      var _creeperFuseActive = (typeof _creeperFusing !== 'undefined') && _creeperFusing;

      if (_bossActive) {
        setAmbientMood('intense');
      } else if (_stormActive || _creeperFuseActive || _heightRatio >= 0.75) {
        setAmbientMood('tense');
      } else if (_heightRatio < 0.50) {
        setAmbientMood('calm');
      }
      // Between 0.50–0.75: hold current mood (hysteresis to prevent flickering)
    }

    // Tick ice bridge slow timer
    if (iceBridgeSlowActive) {
      iceBridgeSlowTimer -= delta;
      if (iceBridgeSlowTimer <= 0) {
        iceBridgeSlowActive = false;
        iceBridgeSlowTimer  = 0;
      }
    }

    // Tick Slow Down power-up timer
    if (slowDownActive) {
      slowDownTimer -= delta;
      if (slowDownTimer <= 0) {
        slowDownActive = false;
        slowDownTimer  = 0;
      }
    }

    // Tick Magnet power-up: auto-mine nearest block within 5 units, once per second
    if (magnetActive) {
      magnetTimer -= delta;
      if (magnetTimer <= 0) {
        magnetActive      = false;
        magnetTimer       = 0;
        magnetLastPullTime = 0;
      } else if (controls && controls.isLocked) {
        magnetLastPullTime += delta;
        if (magnetLastPullTime >= 1.0) {
          magnetLastPullTime = 0;
          const playerPos = controls.getObject().position;
          const MAGNET_RANGE = 5;
          let nearestDist = Infinity;
          let nearestBlock = null;
          worldGroup.children.forEach(function (obj) {
            if (!obj.userData.isBlock || !obj.userData.gridPos) return;
            const dx = playerPos.x - obj.position.x;
            const dy = playerPos.y - obj.position.y;
            const dz = playerPos.z - obj.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < MAGNET_RANGE && dist < nearestDist) {
              nearestDist  = dist;
              nearestBlock = obj;
            }
          });
          if (nearestBlock) {
            spawnDustParticles(nearestBlock, { breakBurst: true });
            blocksMined++;
            if (isCoopMode) coopMyBlocksMined++;
            const oType = nearestBlock.userData.objectType;
            const mName = nearestBlock.userData.materialType || (oType ? OBJECT_TYPE_TO_MATERIAL[oType] : null);
            if (mName) addToInventory(nearestBlock.material.color.getStyle());
            addScore(mName && BLOCK_TYPES[mName] ? BLOCK_TYPES[mName].points : 10);
            unregisterBlock(nearestBlock);
            disposeBlock(nearestBlock);
            worldGroup.remove(nearestBlock);
            if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, undefined);
          }
        }
      }
    }

    // Tick Time Freeze power-up timer
    if (timeFreezeActive) {
      timeFreezeTimer -= delta;
      if (timeFreezeTimer <= 0) {
        timeFreezeActive = false;
        timeFreezeTimer  = 0;
        _applyTimeFreezeGlow(false);
        if (typeof updatePowerupHUD === "function") updatePowerupHUD();
      }
    }

    // Tick Fortress power-up timer
    if (fortressActive) {
      fortressTimer -= delta;
      if (fortressTimer <= 0) {
        fortressActive = false;
        fortressTimer  = 0;
        showCraftedBanner("Fortress expired.");
        if (typeof updatePowerupHUD === "function") updatePowerupHUD();
      }
    }

    // Suppress piece spawning in editor mode or during tutorial spawn-suppressed steps
    const _tutSpawnSuppressed = typeof isTutorialSpawnSuppressed === 'function' && isTutorialSpawnSuppressed() && fallingPieces.length > 0;
    if (!isEditorMode) {
      const _stormSpawnInterval = pieceStormActive ? SPAWN_INTERVAL * 0.5 : SPAWN_INTERVAL;
      spawnTimer += delta;
      if (spawnTimer > _stormSpawnInterval && !_tutSpawnSuppressed) {
        spawnFallingPiece();
        if (pieceStormActive) {
          triggerLightningFlash();
          if (typeof playStormSwoosh === "function") playStormSwoosh();
        }
        spawnTimer = 0;
        // Update puzzle HUD after each spawn
        if ((isPuzzleMode || isCustomPuzzleMode) && typeof updatePuzzleHUD === "function") updatePuzzleHUD();
      }
      updateLineClear(delta);
      if (typeof updateHazardBlocks === 'function') updateHazardBlocks(delta);
      updateFallingPieces(delta);
      if (isBattleMode && typeof battleHud !== 'undefined') battleHud.tick(delta);
      if (isBattleMode && typeof checkBattleScoreRace === 'function') checkBattleScoreRace(delta);
      updateLandingRings(delta);
      updateTrails(delta, elapsedTime);
      updateAuras(delta, camera);
      updateDifficulty(delta);
      updateTreeRespawn(delta, elapsedTime);
      if (typeof updateEventEngine === "function") updateEventEngine(delta);
      if (typeof updateTutorial === "function") updateTutorial(delta);
    }
  }
  updateDangerWarning();

  if (controls && controls.isLocked === true && !isGameOver) {
    // Tick puzzle time limit every frame (timed_score mode)
    if (typeof tickPuzzleTimeLimit === "function") tickPuzzleTimeLimit(delta);

    // Tick survival timer and refresh HUD once per second
    if (gameTimerRunning) {
      gameElapsedSeconds += delta;
      const currentSecond = isBlitzMode
        ? Math.ceil(blitzRemainingMs / 1000)
        : isSprintMode
          ? Math.floor(sprintElapsedMs / 1000)
          : Math.floor(gameElapsedSeconds);
      if (currentSecond !== lastHudSecond) {
        lastHudSecond = currentSecond;
        updateScoreHUD();
        if (typeof achOnSurvivalTime === "function") achOnSurvivalTime(gameElapsedSeconds);
        // Custom puzzle: check time/score-based win conditions each second
        if (isCustomPuzzleMode && typeof checkPuzzleConditions === "function") {
          checkPuzzleConditions();
          if (typeof updatePuzzleHUD === "function") updatePuzzleHUD();
        }
        // Built-in puzzle: refresh HUD each second (covers timed_score countdown)
        if (isPuzzleMode && typeof updatePuzzleHUD === "function") updatePuzzleHUD();
      }
    }

    const playerPosition = controls.getObject().position;

    if (isEditorMode) {
      // Free-fly: vertical velocity driven by Space (up) / Shift (down) keys
      playerVelocity.y = moveUp ? MOVEMENT_SPEED : (moveDown ? -MOVEMENT_SPEED : 0);
    } else {
      if (!playerOnGround) playerVelocity.y -= GRAVITY * delta;
    }
    const _movWmod = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
    const _modSpeedMult = _movWmod ? _movWmod.playerSpeedMult : 1.0;
    const _iceEffect = playerStandingOnIce || (_movWmod && _movWmod.iceAllBlocks);
    const speedDelta = MOVEMENT_SPEED * _modSpeedMult * (_iceEffect ? 1.2 : 1.0) * delta;
    if (moveForward) controls.moveForward(speedDelta);
    if (moveBackward) controls.moveForward(-speedDelta);
    if (moveLeft) controls.moveRight(-speedDelta);
    if (moveRight) controls.moveRight(speedDelta);
    playerPosition.y += playerVelocity.y * delta;
    // Prevent flying below ground in editor mode
    if (isEditorMode && playerPosition.y < PLAYER_HEIGHT) {
      playerPosition.y = PLAYER_HEIGHT;
      if (playerVelocity.y < 0) playerVelocity.y = 0;
    }

    // Apply lateral push impulse from nearby landing pieces
    if (playerPushVelocity.lengthSq() > 0.01) {
      playerPosition.x += playerPushVelocity.x * delta;
      playerPosition.z += playerPushVelocity.z * delta;
      playerPushVelocity.multiplyScalar(Math.pow(PUSH_DECAY, delta));
      if (playerPushVelocity.lengthSq() < 0.01) playerPushVelocity.set(0, 0, 0);
    }

    // Screen shake when pushed
    if (screenShakeActive) {
      const shakeAge = elapsedTime - screenShakeStart;
      if (shakeAge < SCREEN_SHAKE_DURATION) {
        const intensity = (1 - shakeAge / SCREEN_SHAKE_DURATION) * 0.12;
        camera.position.x += (Math.random() - 0.5) * intensity;
        camera.position.y += (Math.random() - 0.5) * intensity;
      } else {
        screenShakeActive = false;
      }
    }

    if (!isEditorMode) checkPlayerCollision(playerVelocity.y * delta);

    // Safety: below bedrock floor → respawn at surface to prevent softlock
    if (isSurvivalMode && controls && controls.isLocked && !isGameOver) {
      if (controls.getObject().position.y < -10.5) {
        returnPlayerToSurface();
      }
    }

    updateTargeting();
    if (isEditorMode && typeof updateEditorGhost === "function") updateEditorGhost();
    if (isEditorMode && typeof tickEditorAutosave === "function") tickEditorAutosave(delta);

    if (pickaxeGroup) {
      const defaultRotationZ = Math.PI / 8;
      if (isMining) {
        const animElapsedTime = elapsedTime - miningAnimStartTime;
        if (animElapsedTime < PICKAXE_ANIMATION_DURATION) {
          const swingPhase =
            (animElapsedTime / PICKAXE_ANIMATION_DURATION) * Math.PI;
          pickaxeGroup.rotation.z =
            defaultRotationZ -
            Math.sin(swingPhase) * PICKAXE_ANIMATION_ANGLE;
        } else {
          isMining = false;
          pickaxeGroup.rotation.z = defaultRotationZ;
        }
      } else {
        pickaxeGroup.rotation.z = defaultRotationZ;
      }
    }

    // Mining shake update
    if (miningShakeActive && miningShakeBlock) {
      const shakeAge = elapsedTime - miningShakeStart;
      if (shakeAge < MINING_SHAKE_DURATION) {
        if (!miningShakeBlock.userData.basePosition) {
          miningShakeBlock.userData.basePosition =
            miningShakeBlock.position.clone();
        }
        const phase = (shakeAge / MINING_SHAKE_DURATION) * Math.PI;
        const offset = Math.sin(phase) * MINING_SHAKE_AMOUNT;
        miningShakeBlock.position.x =
          miningShakeBlock.userData.basePosition.x + offset;
        miningShakeBlock.position.z =
          miningShakeBlock.userData.basePosition.z + offset * 0.5;
      } else {
        if (miningShakeBlock.userData.basePosition) {
          miningShakeBlock.position.copy(
            miningShakeBlock.userData.basePosition
          );
          miningShakeBlock.userData.basePosition = null;
        }
        miningShakeActive = false;
        miningShakeBlock = null;
      }
    }

    updateDustParticles(delta);
    updateCraftingBanner(delta);
    // Tick co-op bonus banner fade-out
    if (coopBonusBannerTimer > 0) {
      coopBonusBannerTimer -= delta;
      if (coopBonusBannerTimer <= 0) {
        coopBonusBannerTimer = 0;
        var _bonusEl = document.getElementById('coop-bonus-overlay');
        if (_bonusEl) { _bonusEl.style.opacity = '0'; }
        setTimeout(function () {
          var _bEl = document.getElementById('coop-bonus-overlay');
          if (_bEl) _bEl.style.display = 'none';
        }, 1100);
      } else if (coopBonusBannerTimer < 1.0) {
        // Start fading in the last second
        var _bonusEl2 = document.getElementById('coop-bonus-overlay');
        if (_bonusEl2) _bonusEl2.style.opacity = String(coopBonusBannerTimer);
      }
    }
  } else {
    playerVelocity.x = 0;
    playerVelocity.z = 0;
    unhighlightTarget();
    targetedBlock = null;
    miningProgress = 0;
    crosshair.classList.remove("target-locked");
    isMining = false;
    if (pickaxeGroup) pickaxeGroup.rotation.z = Math.PI / 8;
  }

  // Animate lava/ice: update shared time uniforms
  lavaUniforms.uTime.value = elapsedTime;
  iceUniforms.uTime.value  = elapsedTime;
  {
    const camPos = camera.position;
    const lavaBlocks = [];
    worldGroup.children.forEach(child => {
      if (child.userData && child.userData.materialType === 'lava') {
        lavaBlocks.push(child);
      }
    });
    lavaBlocks.sort((a, b) =>
      a.position.distanceToSquared(camPos) - b.position.distanceToSquared(camPos)
    );
    const pulse = 1.2 * (0.85 + 0.30 * Math.sin(elapsedTime * 4.4));
    for (let i = 0; i < LAVA_LIGHT_COUNT; i++) {
      if (i < lavaBlocks.length) {
        const p = lavaBlocks[i].position;
        lavaLights[i].position.set(p.x, p.y + 1, p.z);
        lavaLights[i].intensity = pulse;
      } else {
        lavaLights[i].intensity = 0;
      }
    }
  }

  // Animate obsidian shimmer: subtle emissive purple pulse at ~0.8 Hz
  for (let _oi = 0; _oi < obsidianBlocks.length; _oi++) {
    const _ob = obsidianBlocks[_oi];
    if (!_ob.material) continue;
    const _t = Math.sin(elapsedTime * 1.6 + _ob.userData.shimmerOffset) * 0.5 + 0.5;
    _ob.material.emissive.setRGB(
      (0x3d / 255) * _t * 0.35,
      0,
      (0x66 / 255) * _t * 0.35
    );
    _ob.material.needsUpdate = true;
  }

  updatePowerupOverlays();
  updatePostProcessing(delta);

  // Co-op: broadcast local max block height every 2 s
  if (isCoopMode && !isGameOver && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
    if (time - coopHeightBroadcastLastTime >= 2000) {
      coopHeightBroadcastLastTime = time;
      const _localMaxY = typeof getMaxBlockHeight === 'function' ? getMaxBlockHeight() : 0;
      coop.send({ type: 'height', maxY: _localMaxY });
    }
    // Decay partner status dot: lagging after 3 s, disconnected after 6 s
    const _partnerAge = time - coopPartnerLastSeenTime;
    const _newStatus = _partnerAge > 6000 ? 'disconnected' : _partnerAge > 3000 ? 'lagging' : 'connected';
    if (_newStatus !== coopPartnerStatus) {
      coopPartnerStatus = _newStatus;
      if (typeof updateCoopPartnerStatus === 'function') updateCoopPartnerStatus();
    }
  }

  // Co-op: broadcast local position every ~100 ms (rAF-aligned, skip if unchanged)
  if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
    if (time - _coopPosBroadcastLastTime >= 100) {
      const _camObj = controls ? controls.getObject() : null;
      if (_camObj) {
        const _bx = _camObj.position.x;
        const _by = _camObj.position.y;
        const _bz = _camObj.position.z;
        const _bRotY = _camObj.rotation.y;
        const _bRotX = camera.rotation.x;
        const _prev  = _coopPosLastSent;
        if (!_prev || _prev.x !== _bx || _prev.y !== _by || _prev.z !== _bz ||
            _prev.rotY !== _bRotY || _prev.rotX !== _bRotX) {
          coop.send({ type: 'pos', x: _bx, y: _by, z: _bz, rotY: _bRotY, rotX: _bRotX });
          _coopPosLastSent = { x: _bx, y: _by, z: _bz, rotY: _bRotY, rotX: _bRotX };
        }
        _coopPosBroadcastLastTime = time;
      }
    }
  }

  // Co-op: interpolate remote avatar
  if (typeof coopAvatar !== 'undefined') coopAvatar.tick();

  if (composer) {
    composer.render(delta);
  } else {
    renderer.render(scene, camera);
  }

  // Co-op: render CSS2D nameplate layer on top
  if (typeof coopAvatar !== 'undefined') coopAvatar.renderLabels();

  // Earthquake camera shake: sinusoidal position offset applied post-render
  // to avoid post-processing (SSAO) conflicts. Max ±0.15 units on X/Y.
  if (earthquakeActive) {
    const t   = clock.getElapsedTime();
    const newX = Math.sin(t * 18.3) * 0.15;
    const newY = Math.sin(t * 23.7 + 1.2) * 0.15;
    camera.position.x += newX - _eqShakeOffX;
    camera.position.y += newY - _eqShakeOffY;
    _eqShakeOffX = newX;
    _eqShakeOffY = newY;
  } else if (_eqShakeOffX !== 0 || _eqShakeOffY !== 0) {
    // Undo last offset when earthquake just ended
    camera.position.x -= _eqShakeOffX;
    camera.position.y -= _eqShakeOffY;
    _eqShakeOffX = 0;
    _eqShakeOffY = 0;
  }

  lastTime = time;
}

