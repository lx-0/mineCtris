// Co-op lobby UI and event wiring — called once from init().
// Requires: social/coop.js loaded first.

function _initCoopHandlers() {
    (function () {
      var coopOverlay     = document.getElementById("coop-overlay");
      var coopChoiceView  = document.getElementById("coop-choice-view");
      var coopCreateView  = document.getElementById("coop-create-view");
      var coopJoinView    = document.getElementById("coop-join-view");
      var coopReadyView   = document.getElementById("coop-ready-view");

      if (!coopOverlay || typeof coop === "undefined") return;

      function showCoopView(name) {
        [coopChoiceView, coopCreateView, coopJoinView, coopReadyView].forEach(function (v) {
          if (v) v.style.display = "none";
        });
        var target = {
          choice: coopChoiceView,
          create: coopCreateView,
          join:   coopJoinView,
          ready:  coopReadyView,
        }[name];
        if (target) target.style.display = "";
      }

      function openCoopOverlay(initialView) {
        hideModeSelect();
        blocker.style.display = "none";
        showCoopView(initialView || "choice");
        coopOverlay.style.display = "flex";
      }

      function closeCoopOverlay() {
        coopOverlay.style.display = "none";
        coop.disconnect();
        isDailyCoopChallenge = false;
        // Return to menu
        blocker.style.display = "flex";
        instructions.style.display = "";
      }

      // Co-op mode card click
      var coopCardEl = document.getElementById("mode-card-coop");
      if (coopCardEl) {
        coopCardEl.addEventListener("click", function () {
          openCoopOverlay("choice");
        });
      }

      // ── Register coop state-change handler once ──
      coop.on("state_change", function (data) {
        if (data.state === "ready") {
          var readyCodeEl = document.getElementById("coop-ready-code");
          if (readyCodeEl) readyCodeEl.textContent = "Room: " + (data.roomCode || "");
          // Reset ready state for both players
          _coopHostReady = false;
          _coopGuestReady = false;
          _updateReadyIndicators();
          // Show correct difficulty UI based on role
          _initReadyViewForRole();
          showCoopView("ready");
        } else if (data.state === "disconnected") {
          var statusEl = document.getElementById("coop-status-msg");
          if (statusEl) statusEl.textContent = "Disconnected.";
          closeCoopOverlay();
        }
      });

      coop.on("timeout", function () {
        var statusEl = document.getElementById("coop-status-msg");
        if (statusEl) statusEl.textContent = "No one joined. Room closed.";
        setTimeout(function () { closeCoopOverlay(); }, 2000);
      });

      coop.on("partner_left", function () {
        // Partner left after game started — handled by game layer; ignore here
      });

      // ── Choice view buttons ──
      var createBtn = document.getElementById("coop-create-btn");
      if (createBtn) {
        createBtn.addEventListener("click", function () {
          showCoopView("create");
          var roomCodeEl   = document.getElementById("coop-room-code");
          var statusMsg    = document.getElementById("coop-status-msg");
          var copyFeedback = document.getElementById("coop-copy-feedback");
          if (roomCodeEl) roomCodeEl.textContent = "…";
          if (statusMsg)  statusMsg.textContent   = "";
          if (copyFeedback) copyFeedback.textContent = "";

          coop.createRoom().then(function (code) {
            if (roomCodeEl) roomCodeEl.textContent = code;
          }).catch(function () {
            if (statusMsg) statusMsg.textContent = "Failed to create room.";
          });
        });
      }

      var joinBtnChoice = document.getElementById("coop-join-btn-choice");
      if (joinBtnChoice) {
        joinBtnChoice.addEventListener("click", function () {
          showCoopView("join");
          var joinStatusEl = document.getElementById("coop-join-status-msg");
          if (joinStatusEl) joinStatusEl.textContent = "";
          var codeInput = document.getElementById("coop-code-input");
          if (codeInput) { codeInput.value = ""; codeInput.focus(); }
        });
      }

      // ── Daily Co-op Challenge button ──
      var coopDailyBtn = document.getElementById("coop-daily-btn");
      if (coopDailyBtn) {
        // Show previous daily coop best if available
        var coopDailyBestDisplay = document.getElementById("coop-daily-best-display");
        if (coopDailyBestDisplay) {
          var _coopDailyBestRaw = null;
          try { _coopDailyBestRaw = JSON.parse(localStorage.getItem('mineCtris_coopDailyBest') || 'null'); } catch (_e) {}
          var _today = typeof getDailyDateString === 'function' ? getDailyDateString() : '';
          if (_coopDailyBestRaw && _coopDailyBestRaw.date === _today) {
            coopDailyBestDisplay.textContent = 'Your best today: ' + _coopDailyBestRaw.score.toLocaleString() +
              ' (with ' + _coopDailyBestRaw.partner + ')';
            coopDailyBestDisplay.style.display = 'block';
          }
        }

        coopDailyBtn.addEventListener("click", function () {
          isDailyCoopChallenge = true;
          // Open lobby as normal — same room flow, just with daily seed
          showCoopView("create");
          var roomCodeEl   = document.getElementById("coop-room-code");
          var statusMsg    = document.getElementById("coop-status-msg");
          var copyFeedback = document.getElementById("coop-copy-feedback");
          if (roomCodeEl) roomCodeEl.textContent = "…";
          if (statusMsg)  statusMsg.textContent   = "";
          if (copyFeedback) copyFeedback.textContent = "";
          coop.createRoom().then(function (code) {
            if (roomCodeEl) roomCodeEl.textContent = code;
          }).catch(function () {
            if (statusMsg) statusMsg.textContent = "Failed to create room.";
          });
        });
      }

      var choiceCancelBtn = document.getElementById("coop-choice-cancel-btn");
      if (choiceCancelBtn) {
        choiceCancelBtn.addEventListener("click", function () {
          closeCoopOverlay();
        });
      }

      // ── Create view buttons ──
      var copyLinkBtn = document.getElementById("coop-copy-link-btn");
      if (copyLinkBtn) {
        copyLinkBtn.addEventListener("click", function () {
          var code = coop.roomCode;
          if (!code) return;
          var url = window.location.origin + window.location.pathname + "?room=" + code;
          var feedbackEl = document.getElementById("coop-copy-feedback");
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              if (feedbackEl) {
                feedbackEl.textContent = "\u2713 Copied!";
                setTimeout(function () { feedbackEl.textContent = ""; }, 2000);
              }
            }).catch(function () { window.prompt("Copy invite link:", url); });
          } else {
            window.prompt("Copy invite link:", url);
          }
        });
      }

      var createCancelBtn = document.getElementById("coop-create-cancel-btn");
      if (createCancelBtn) {
        createCancelBtn.addEventListener("click", function () { closeCoopOverlay(); });
      }

      // ── Join view buttons & code input ──
      var codeInput = document.getElementById("coop-code-input");
      if (codeInput) {
        codeInput.addEventListener("input", function () {
          this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        });
        codeInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            var confirmBtn = document.getElementById("coop-join-confirm-btn");
            if (confirmBtn) confirmBtn.click();
          }
        });
      }

      var joinConfirmBtn = document.getElementById("coop-join-confirm-btn");
      if (joinConfirmBtn) {
        joinConfirmBtn.addEventListener("click", function () {
          var code = codeInput ? codeInput.value.trim().toUpperCase() : "";
          var joinStatusEl = document.getElementById("coop-join-status-msg");
          if (!code || code.length !== 4) {
            if (joinStatusEl) joinStatusEl.textContent = "Enter a 4-character code.";
            return;
          }
          if (joinStatusEl) joinStatusEl.textContent = "Joining\u2026";
          coop.joinRoom(code).then(function () {
            if (joinStatusEl) joinStatusEl.textContent = "";
            showCoopView("create");
            var roomCodeEl = document.getElementById("coop-room-code");
            if (roomCodeEl) roomCodeEl.textContent = code;
            var waitingEl = document.getElementById("coop-waiting-spinner");
            if (waitingEl) waitingEl.textContent = "\u9696 Connected \u2014 waiting for host\u2026";
          }).catch(function (err) {
            if (joinStatusEl) joinStatusEl.textContent = (err && err.message) ? err.message : "Failed to join.";
          });
        });
      }

      var joinCancelBtn = document.getElementById("coop-join-cancel-btn");
      if (joinCancelBtn) {
        joinCancelBtn.addEventListener("click", function () {
          coop.disconnect();
          showCoopView("choice");
        });
      }

      // ── Ready view state ──
      var _coopHostReady = false;
      var _coopGuestReady = false;

      function _updateReadyIndicators() {
        var hostEl = document.getElementById('coop-host-ready-indicator');
        var guestEl = document.getElementById('coop-guest-ready-indicator');
        if (hostEl) {
          hostEl.textContent = (_coopHostReady ? '\u2611' : '\u2633') + ' Host';
          hostEl.className = _coopHostReady ? 'ready' : '';
        }
        if (guestEl) {
          guestEl.textContent = (_coopGuestReady ? '\u2611' : '\u2633') + ' Guest';
          guestEl.className = _coopGuestReady ? 'ready' : '';
        }
      }

      function _applyCoopDifficulty(level) {
        var settings = typeof COOP_DIFFICULTY_SETTINGS !== 'undefined' ? COOP_DIFFICULTY_SETTINGS : null;
        if (!settings || !settings[level]) return;
        coopDifficulty = level;
        coopFallMultiplier = settings[level].fallMult;
        coopScoreMultiplier = settings[level].scoreMult;
      }

      function _initReadyViewForRole() {
        var diffBtns   = document.getElementById('coop-diff-btns');
        var guestDisp  = document.getElementById('coop-diff-guest-display');
        var guestLabel = document.getElementById('coop-diff-guest-label');
        if (coop.isHost) {
          // Host: show interactive buttons, hide guest read-only label
          if (diffBtns)  diffBtns.style.display = 'flex';
          if (guestDisp) guestDisp.style.display = 'none';
          // Set default selection highlight
          _setDiffButtonSelected('normal');
          _applyCoopDifficulty('normal');
        } else {
          // Guest: hide buttons, show read-only label
          if (diffBtns)  diffBtns.style.display = 'none';
          if (guestDisp) guestDisp.style.display = '';
          if (guestLabel) guestLabel.textContent = 'NORMAL';
          _applyCoopDifficulty('normal');
        }
      }

      function _setDiffButtonSelected(level) {
        var btns = document.querySelectorAll('.coop-diff-btn');
        btns.forEach(function (btn) {
          if (btn.dataset.level === level) {
            btn.classList.add('coop-diff-selected');
          } else {
            btn.classList.remove('coop-diff-selected');
          }
        });
      }

      // Difficulty button clicks (host only — buttons are hidden for guest)
      document.querySelectorAll('.coop-diff-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!coop.isHost) return;
          var level = btn.dataset.level;
          _setDiffButtonSelected(level);
          _applyCoopDifficulty(level);
          coop.send({ type: 'difficulty', level: level });
        });
      });

      function _startCoopGame() {
        isCoopMode = true;
        isDailyChallenge = false;
        if (typeof metricsModePlayed === 'function') metricsModePlayed('coop');
        // isDailyCoopChallenge is set BEFORE calling _startCoopGame; preserve it here
        gameRng = isDailyCoopChallenge ? getDailyPrng() : null;
        coopPieceQueue.length = 0;
        applyWorldModifierHUD();
        _initCoopHUD();
        camera.position.set(0, PLAYER_HEIGHT, 0);
        if (typeof coopAvatar !== 'undefined') coopAvatar.init('Partner');
        if (typeof coopTrade !== 'undefined') coopTrade.showFirstRunHint();
        if (typeof coopEmote !== 'undefined') coopEmote.showHud(true);
        coop.startGame();
        coopOverlay.style.display = "none";
        setTimeout(function () { requestPointerLock(); }, 500);
      }

      // ── Ready view buttons ──
      var startBtn = document.getElementById("coop-start-btn");
      if (startBtn) {
        startBtn.addEventListener("click", function () {
          if (coop.isHost) {
            _coopHostReady = true;
            _updateReadyIndicators();
            coop.send({ type: 'player_ready' });
            startBtn.disabled = true;
            startBtn.textContent = '\u2611 Ready!';
            // If guest already marked ready, start immediately
            if (_coopGuestReady) {
              coop.send({ type: 'game_start', difficulty: coopDifficulty, isDaily: isDailyCoopChallenge });
              _startCoopGame();
            }
          } else {
            // Guest
            _coopGuestReady = true;
            _updateReadyIndicators();
            coop.send({ type: 'player_ready' });
            startBtn.disabled = true;
            startBtn.textContent = '\u2611 Ready!';
            // Guest waits for host to send game_start
          }
        });
      }

      // ── Co-op in-game HUD helpers ──
      function _initCoopHUD() {
        // Reset co-op score state
        coopScore = 0; coopMyScore = 0; coopPartnerScore = 0;
        coopPartnerMaxY = 0; coopHeightBroadcastLastTime = 0;
        coopPartnerStatus = 'connected'; coopPartnerLastSeenTime = performance.now();
        // Show CO-OP badge with difficulty label (and DAILY marker if applicable)
        var coopBadgeEl = document.getElementById('coop-mode-badge');
        if (coopBadgeEl) {
          coopBadgeEl.style.display = 'flex';
          var diffLabelEl = document.getElementById('coop-difficulty-label');
          if (diffLabelEl) {
            var diffKey = coopDifficulty.toUpperCase();
            diffLabelEl.textContent = isDailyCoopChallenge ? ' DAILY \u00b7 ' + diffKey : ' ' + diffKey;
          }
        }
        // Show co-op score HUD; hide solo score
        var coopHudEl = document.getElementById('coop-score-display');
        if (coopHudEl) coopHudEl.style.display = 'block';
        // Show partner status indicator
        var partnerStatusEl = document.getElementById('coop-partner-status');
        if (partnerStatusEl) partnerStatusEl.style.display = 'flex';
        if (typeof updateCoopScoreHUD === 'function') updateCoopScoreHUD();
        if (typeof updateCoopPartnerStatus === 'function') updateCoopPartnerStatus();
        // Show co-op bonus banner (fades out after 3s)
        var bonusEl = document.getElementById('coop-bonus-overlay');
        if (bonusEl) {
          var settings = typeof COOP_DIFFICULTY_SETTINGS !== 'undefined' ? COOP_DIFFICULTY_SETTINGS : null;
          var mult = settings && settings[coopDifficulty] ? settings[coopDifficulty].scoreMult : coopScoreMultiplier;
          bonusEl.textContent = mult + 'x CO-OP BONUS';
          bonusEl.style.display = 'block';
          bonusEl.style.opacity = '1';
          coopBonusBannerTimer = 3.0;
        }
      }

      function _showCoopPartnerLeftDialog() {
        var dialogEl = document.getElementById('coop-partner-left-dialog');
        if (!dialogEl) return;
        dialogEl.style.display = 'flex';
        var countdownEl = dialogEl.querySelector('#coop-partner-left-countdown');
        var remaining = 10;
        if (countdownEl) countdownEl.textContent = remaining;
        var timerHandle = setInterval(function () {
          remaining--;
          if (countdownEl) countdownEl.textContent = remaining;
          if (remaining <= 0) {
            clearInterval(timerHandle);
            dialogEl.style.display = 'none';
            // Default: continue solo
          }
        }, 1000);
        var continueBtn = dialogEl.querySelector('#coop-partner-left-continue');
        var quitBtn = dialogEl.querySelector('#coop-partner-left-quit');
        if (continueBtn) {
          continueBtn.onclick = function () {
            clearInterval(timerHandle);
            dialogEl.style.display = 'none';
            isCoopMode = false;
          };
        }
        if (quitBtn) {
          quitBtn.onclick = function () {
            clearInterval(timerHandle);
            dialogEl.style.display = 'none';
            if (typeof resetGame === 'function') resetGame();
            else location.reload();
          };
        }
      }

      // ── Handle pieces from DO ──
      coop.on('piece', function (data) {
        if (isCoopMode) {
          coopPieceQueue.push(data);
        }
      });

      // ── Incoming difficulty change from host ──
      coop.on('difficulty', function (msg) {
        if (!msg || !msg.level) return;
        _applyCoopDifficulty(msg.level);
        // Update guest read-only display
        var guestLabel = document.getElementById('coop-diff-guest-label');
        if (guestLabel) guestLabel.textContent = msg.level.toUpperCase();
        // Also update host's selected button (in case message was echoed back)
        if (coop.isHost) _setDiffButtonSelected(msg.level);
      });

      // ── Incoming ready signal from partner ──
      coop.on('player_ready', function () {
        if (coop.isHost) {
          _coopGuestReady = true;
          _updateReadyIndicators();
          // If host already clicked Ready, start the game now
          if (_coopHostReady) {
            coop.send({ type: 'game_start', difficulty: coopDifficulty, isDaily: isDailyCoopChallenge });
            _startCoopGame();
          }
        } else {
          _coopHostReady = true;
          _updateReadyIndicators();
          // Guest waits — host will send game_start
        }
      });

      // ── Guest: start game when DO relays host's game_start ──
      coop.on('game_start', function (msg) {
        if (coop.state !== CoopState.IN_GAME) {
          // Apply difficulty sent by host
          if (msg && msg.difficulty) _applyCoopDifficulty(msg.difficulty);
          isCoopMode = true;
          isDailyChallenge = false;
          isDailyCoopChallenge = !!(msg && msg.isDaily);
          gameRng = isDailyCoopChallenge ? getDailyPrng() : null;
          coopPieceQueue.length = 0;
          _initCoopHUD();
          // Guest spawns 3 blocks away from host, both facing +Z
          camera.position.set(3, PLAYER_HEIGHT, 0);
          if (typeof coopAvatar !== 'undefined') coopAvatar.init('Partner');
          if (typeof coopTrade !== 'undefined') coopTrade.showFirstRunHint();
          if (typeof coopEmote !== 'undefined') coopEmote.showHud(true);
          coop.startGame();
          if (coopOverlay) coopOverlay.style.display = "none";
          applyWorldModifierHUD();
          setTimeout(function () { requestPointerLock(); }, 500);
        }
      });

      // ── Incoming partner position broadcasts ──
      coop.on('pos', function (data) {
        // Track raw partner position for proximity checks (e.g. trade)
        coopPartnerLastPos = { x: data.x, y: data.y, z: data.z };
        if (isCoopMode && typeof coopAvatar !== 'undefined') {
          coopAvatar.receivePosition(
            data.x, data.y, data.z, data.rotY, data.rotX
          );
        }
      });

      // ── Incoming emotes from partner ──
      coop.on('emote', function (data) {
        if (!isCoopMode) return;
        if (typeof coopEmote !== 'undefined') coopEmote.receiveEmote(data);
      });

      // ── Destroy avatar when partner disconnects ──
      coop.on('partner_left', function () {
        if (typeof coopAvatar !== 'undefined') coopAvatar.destroy();
        if (typeof coopEmote !== 'undefined') { coopEmote.reset(); coopEmote.showHud(false); }
      });
      coop.on('disconnected', function () {
        if (typeof coopAvatar !== 'undefined') coopAvatar.destroy();
        if (typeof coopEmote !== 'undefined') { coopEmote.reset(); coopEmote.showHud(false); }
      });

      // ── Incoming world-state mutations from partner ──
      coop.on('world', function (msg) {
        if (!isCoopMode) return;
        if (msg.action === 'break') {
          var _wb = _findBlockAtGrid(msg.pos[0], msg.pos[1], msg.pos[2]);
          if (!_wb) return;
          spawnDustParticles(_wb, { breakBurst: true });
          unregisterBlock(_wb);
          disposeBlock(_wb);
          worldGroup.remove(_wb);
          var _obIdx = obsidianBlocks.indexOf(_wb);
          if (_obIdx !== -1) obsidianBlocks.splice(_obIdx, 1);
        } else if (msg.action === 'place') {
          var _px = msg.pos[0], _py = msg.pos[1], _pz = msg.pos[2];
          var _layer = gridOccupancy.get(_py);
          if (_layer && _layer.has(_px + ',' + _pz)) return; // already occupied
          var _pb = createBlockMesh(new THREE.Color(msg.color));
          _pb.name = 'landed_block';
          _pb.position.set(_px, _py, _pz);
          worldGroup.add(_pb);
          registerBlock(_pb);
          checkLineClear([_pb]);
        } else if (msg.action === 'land') {
          // Reconciliation: add any blocks the partner landed that we're missing
          if (!Array.isArray(msg.blocks)) return;
          msg.blocks.forEach(function (b) {
            var _lx = b.pos[0], _ly = b.pos[1], _lz = b.pos[2];
            var _ll = gridOccupancy.get(_ly);
            if (_ll && _ll.has(_lx + ',' + _lz)) return; // already exists locally
            var _lb = createBlockMesh(new THREE.Color(b.color));
            _lb.name = 'landed_block';
            _lb.position.set(_lx, _ly, _lz);
            worldGroup.add(_lb);
            registerBlock(_lb);
          });
        }
      });

      // ── Incoming line-clear events from partner ──
      coop.on('line_clear', function (msg) {
        if (!isCoopMode) return;
        // Achievement: sync line-clear (track partner timestamp regardless of guard)
        if (typeof achOnCoopPartnerLineClear === 'function') achOnCoopPartnerLineClear(Date.now());
        // Guard: if local detection already processed these rows, skip
        if (typeof _coopLineClearGuardHas === 'function' && _coopLineClearGuardHas(msg.rows)) return;
        // Fallback: local detection didn't fire, so score the partner's line clear
        if (typeof addScore === 'function' && typeof msg.score === 'number') {
          addScore(msg.score);
        }
      });

      // ── Incoming score delta from partner ──
      coop.on('score', function (msg) {
        if (!isCoopMode) return;
        if (typeof msg.delta !== 'number') return;
        coopScore += msg.delta;
        coopPartnerScore += msg.delta;
        if (typeof updateCoopScoreHUD === 'function') updateCoopScoreHUD();
      });

      // ── Incoming height broadcast from partner ──
      coop.on('height', function (msg) {
        if (!isCoopMode) return;
        if (typeof msg.maxY === 'number') {
          coopPartnerMaxY = msg.maxY;
          coopPartnerLastSeenTime = performance.now();
          coopPartnerStatus = 'connected';
          if (typeof updateCoopPartnerStatus === 'function') updateCoopPartnerStatus();
        }
      });

      // ── Incoming game_over broadcast from partner ──
      coop.on('game_over', function () {
        if (!isCoopMode) return;
        if (typeof coopEmote !== 'undefined') coopEmote.showHud(false);
        if (!isGameOver && typeof triggerGameOver === 'function') {
          triggerGameOver();
        }
      });

      // ── Incoming game_end_stats from partner ──
      coop.on('game_end_stats', function (msg) {
        if (!isCoopMode) return;
        coopPartnerBlocksMined    = (typeof msg.blocksMined    === 'number') ? msg.blocksMined    : 0;
        coopPartnerLinesTriggered = (typeof msg.linesTriggered === 'number') ? msg.linesTriggered : 0;
        coopPartnerCraftsMade     = (typeof msg.craftsMade     === 'number') ? msg.craftsMade     : 0;
        coopPartnerTradesCompleted= (typeof msg.tradesCompleted=== 'number') ? msg.tradesCompleted: 0;
        coopPartnerName           = msg.name || 'Partner';
        coopStatsReceived = true;
        // If guest, reply with our own stats now
        if (!coop.isHost) {
          coop.send({
            type: 'game_end_stats',
            blocksMined:     coopMyBlocksMined,
            linesTriggered:  coopMyLinesTriggered,
            craftsMade:      coopMyCraftsMade,
            tradesCompleted: coopMyTradesCompleted,
            name: typeof loadDisplayName === 'function' ? (loadDisplayName() || 'You') : 'You',
          });
        }
        // Refresh the summary screen now that we have full data
        if (typeof _refreshCoopGameOver === 'function') _refreshCoopGameOver();

        // Auto-submit co-op score if both players have display names set
        var _myDisplayName = typeof loadDisplayName === 'function' ? loadDisplayName() : '';
        var _partnerDisplayName = coopPartnerName && coopPartnerName !== 'Partner' ? coopPartnerName : '';
        if (_myDisplayName && _partnerDisplayName && typeof apiSubmitCoopScore === 'function') {
          var _lbFeedbackEl = document.getElementById('coop-go-lb-feedback');
          var _rankEl = document.getElementById('coop-go-rank');
          if (_lbFeedbackEl) { _lbFeedbackEl.textContent = 'Submitting score…'; _lbFeedbackEl.style.display = 'block'; }
          apiSubmitCoopScore(_myDisplayName, _partnerDisplayName, coopScore, coopDifficulty, isDailyCoopChallenge)
            .then(function (result) {
              if (result && result.ok) {
                if (_rankEl) {
                  _rankEl.textContent = 'You are #' + result.rank + ' today!';
                  _rankEl.style.display = 'block';
                }
                if (_lbFeedbackEl) _lbFeedbackEl.style.display = 'none';
                // Save daily coop best locally
                if (isDailyCoopChallenge) {
                  try {
                    var _today = typeof getDailyDateString === 'function' ? getDailyDateString() : '';
                    var _existing = JSON.parse(localStorage.getItem('mineCtris_coopDailyBest') || 'null');
                    if (!_existing || _existing.date !== _today || coopScore > _existing.score) {
                      localStorage.setItem('mineCtris_coopDailyBest', JSON.stringify({
                        date: _today,
                        score: coopScore,
                        partner: _partnerDisplayName,
                      }));
                    }
                  } catch (_e) {}
                }
              } else {
                var _msg = (result && result.error) || 'Could not submit score';
                if (_lbFeedbackEl) { _lbFeedbackEl.textContent = _msg; _lbFeedbackEl.style.display = 'block'; }
              }
            })
            .catch(function () {
              if (_lbFeedbackEl) { _lbFeedbackEl.textContent = 'Network error'; _lbFeedbackEl.style.display = 'block'; }
            });
        }
      });

      // ── Incoming trade messages ──
      coop.on('trade_offer', function (msg) {
        if (!isCoopMode) return;
        if (typeof coopTrade !== 'undefined') coopTrade.onTradeOffer(msg);
      });
      coop.on('trade_accept', function (msg) {
        if (!isCoopMode) return;
        if (typeof coopTrade !== 'undefined') coopTrade.onTradeAccept(msg);
      });
      coop.on('trade_cancel', function () {
        if (!isCoopMode) return;
        if (typeof coopTrade !== 'undefined') coopTrade.onTradeCancel();
      });

      // ── Partner left mid-game: show continue/quit choice ──
      coop.on('partner_left', function () {
        if (!isCoopMode || isGameOver) return;
        // Close trade panel / dismiss incoming toast so pointer lock is restored
        if (typeof coopTrade !== 'undefined') {
          coopTrade.closePanel();
          coopTrade.onTradeCancel();
        }
        _showCoopPartnerLeftDialog();
      });

      var readyCancelBtn = document.getElementById("coop-ready-cancel-btn");
      if (readyCancelBtn) {
        readyCancelBtn.addEventListener("click", function () { closeCoopOverlay(); });
      }

      // ── Auto-show join dialog if ?room=CODE in URL ──
      (function () {
        var params = new URLSearchParams(window.location.search);
        var roomParam = params.get("room");
        if (roomParam && /^[A-Z0-9]{4}$/i.test(roomParam)) {
          // Wait for DOM to settle then open join dialog pre-filled
          setTimeout(function () {
            openCoopOverlay("join");
            var ci = document.getElementById("coop-code-input");
            if (ci) ci.value = roomParam.toUpperCase();
            var joinStatusEl = document.getElementById("coop-join-status-msg");
            if (joinStatusEl) joinStatusEl.textContent = "Code from invite link — press Join!";
          }, 200);
        }
      })();

      // ── Co-op game-over screen buttons ──
      (function () {
        function _resetForCoopReplay() {
          // Reset game world and state but keep the WebSocket alive
          _coopHostReady = false;
          _coopGuestReady = false;
          resetGame();
          // resetGame() shows the start blocker — override to show coop ready view
          var startScreen = document.getElementById('blocker');
          if (startScreen) startScreen.style.display = 'none';
          var startBtnEl = document.getElementById('coop-start-btn');
          if (startBtnEl) { startBtnEl.disabled = false; startBtnEl.textContent = 'Ready!'; }
          _updateReadyIndicators();
          coopOverlay.style.display = 'flex';
          showCoopView('ready');
        }

        var playAgainBtn = document.getElementById('coop-go-play-again-btn');
        if (playAgainBtn) {
          playAgainBtn.addEventListener('click', function () {
            _resetForCoopReplay();
          });
        }

        var changeDiffBtn = document.getElementById('coop-go-change-diff-btn');
        if (changeDiffBtn) {
          changeDiffBtn.addEventListener('click', function () {
            _resetForCoopReplay();
          });
        }

        var mainMenuBtn = document.getElementById('coop-go-main-menu-btn');
        if (mainMenuBtn) {
          mainMenuBtn.addEventListener('click', function () {
            coop.disconnect();
            resetGame();
          });
        }

        var shareBtn = document.getElementById('coop-go-share-btn');
        if (shareBtn) {
          shareBtn.addEventListener('click', function () {
            var myName = (typeof loadDisplayName === 'function' ? loadDisplayName() : '') || 'You';
            var partnerName = coopPartnerName || 'Partner';
            var totalSecs = Math.floor(gameElapsedSeconds);
            var mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
            var ss = (totalSecs % 60).toString().padStart(2, '0');
            var mvpCol = typeof _getCoopMVP === 'function' ? _getCoopMVP(myName, partnerName) : 'tie';
            var mvpName = mvpCol === 'me' ? myName : mvpCol === 'partner' ? partnerName : null;
            var shareText = 'MineCtris Co-op\n' +
              myName + ' + ' + partnerName + '\n' +
              'Combined Score: ' + coopScore.toLocaleString() + '\n' +
              (mvpName ? 'MVP: ' + mvpName + '\n' : 'Perfect Partnership!\n') +
              'Survived: ' + mm + ':' + ss;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(shareText).then(function () {
                shareBtn.textContent = 'Copied!';
                setTimeout(function () { shareBtn.textContent = 'Share Run'; }, 1500);
              }).catch(function () {
                prompt('Copy your share card:', shareText);
              });
            } else {
              prompt('Copy your share card:', shareText);
            }
          });
        }
      })();
    })();

}
