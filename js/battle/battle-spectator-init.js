// Battle spectator overlay UI and event wiring — called from _initBattleHandlers().
// Requires: battle/battle-init.js loaded first.

function _initBattleSpectator() {
    (function () {
      // ── Spectator overlay logic ──
      var _spectatorResultTimer = null;

      // Spectator state
      var _spectatorMatchMode = 'survival';
      var _spectatorScoreRaceMs = 0;
      var _spectatorTimerRaf = null;
      var _spectatorTimerLast = 0;
      var _spectatorTickerEvents = []; // last 5 ticker events

      var _SPEC_PU_DEFS = {
        row_bomb:   { icon: '\uD83D\uDCA3', name: 'Row Bomb' },
        slow_down:  { icon: '\u23F1',       name: 'Slow Down' },
        shield:     { icon: '\uD83D\uDEE1', name: 'Shield' },
        magnet:     { icon: '\uD83E\uDDF2', name: 'Magnet' },
        time_freeze:{ icon: '\u2744',       name: 'Time Freeze' },
        sabotage:   { icon: '\uD83D\uDCA5', name: 'Sabotage' },
        counter:    { icon: '\uD83D\uDEE1\u2194', name: 'Counter' },
        fortress:   { icon: '\uD83D\uDEE1\u26EA', name: 'Fortress' },
      };

      function _openSpectatorOverlay(roomCode) {
        var overlayEl = document.getElementById("spectator-overlay");
        if (!overlayEl) return;
        overlayEl.style.display = "flex";

        var roomLabel = document.getElementById("spectator-room-label");
        if (roomLabel) roomLabel.textContent = "Room: " + roomCode;

        var statusEl = document.getElementById("spectator-status-msg");
        if (statusEl) statusEl.textContent = "Connected \u2014 waiting for match state\u2026";

        var resultEl = document.getElementById("spectator-result");
        if (resultEl) resultEl.style.display = "none";

        // Reset ticker and timer state
        _spectatorTickerEvents = [];
        _spectatorMatchMode = 'survival';
        _spectatorScoreRaceMs = 0;
        _spectatorStopTimer();
        var tickerInner = document.getElementById("spectator-ticker-inner");
        if (tickerInner) tickerInner.innerHTML = '';
        var timerEl = document.getElementById("spectator-match-timer");
        if (timerEl) timerEl.style.display = "none";
        var tournCtx = document.getElementById("spectator-tournament-ctx");
        if (tournCtx) tournCtx.style.display = "none";

        _updateSpectatorCountBadge(battle.spectatorCount);

        // Register spectator event listeners
        battle.on("spectator_welcome",      _onSpectatorWelcome);
        battle.on("battle_board",           _onSpectatorBattleBoard);
        battle.on("battle_rating",          _onSpectatorBattleRating);
        battle.on("battle_attack",          _onSpectatorBattleAttack);
        battle.on("battle_powerup",         _onSpectatorBattlePowerup);
        battle.on("battle_start",           _onSpectatorMatchStart);
        battle.on("battle_game_over",       _onSpectatorGameOver);
        battle.on("battle_score_race_end",  _onSpectatorScoreRaceEnd);
        battle.on("player_left",            _onSpectatorPlayerLeft);
        battle.on("state_change",           _onSpectatorStateChange);

        document.addEventListener("keydown", _spectatorEscHandler);
      }

      function _closeSpectatorOverlay() {
        var overlayEl = document.getElementById("spectator-overlay");
        if (overlayEl) overlayEl.style.display = "none";

        if (_spectatorResultTimer) { clearTimeout(_spectatorResultTimer); _spectatorResultTimer = null; }
        _spectatorStopTimer();

        battle.off("spectator_welcome",     _onSpectatorWelcome);
        battle.off("battle_board",          _onSpectatorBattleBoard);
        battle.off("battle_rating",         _onSpectatorBattleRating);
        battle.off("battle_attack",         _onSpectatorBattleAttack);
        battle.off("battle_powerup",        _onSpectatorBattlePowerup);
        battle.off("battle_start",          _onSpectatorMatchStart);
        battle.off("battle_game_over",      _onSpectatorGameOver);
        battle.off("battle_score_race_end", _onSpectatorScoreRaceEnd);
        battle.off("player_left",           _onSpectatorPlayerLeft);
        battle.off("state_change",          _onSpectatorStateChange);
        document.removeEventListener("keydown", _spectatorEscHandler);

        battle.disconnect();
        blocker.style.display = "flex";
        instructions.style.display = "";
      }

      function _spectatorEscHandler(e) {
        if (e.key === "Escape") _closeSpectatorOverlay();
      }

      function _updateSpectatorCountBadge(count) {
        var el = document.getElementById("spectator-count-badge");
        if (el) el.textContent = count + ' spectator' + (count !== 1 ? 's' : '');
      }

      // ── Ticker helpers ──────────────────────────────────────────────────────

      function _specTickerAdd(text, player) {
        // player: 'host' (blue), 'guest' (green), or null (neutral grey)
        var color = player === 'guest' ? '#00ff8c' : (player === 'host' ? '#4db8ff' : '#aaaaaa');
        var entry = { text: text, color: color };
        _spectatorTickerEvents.push(entry);
        if (_spectatorTickerEvents.length > 5) _spectatorTickerEvents.shift();
        var inner = document.getElementById("spectator-ticker-inner");
        if (!inner) return;
        // Rebuild visible ticker (newest on top via column-reverse)
        inner.innerHTML = '';
        var visible = _spectatorTickerEvents.slice().reverse();
        for (var i = 0; i < visible.length; i++) {
          var div = document.createElement('div');
          div.style.color = visible[i].color;
          div.style.opacity = String(1 - i * 0.18);
          div.textContent = visible[i].text;
          inner.appendChild(div);
        }
      }

      function _specPlayerLabel(player) {
        var nameId = player === 'host' ? 'spectator-host-name' : 'spectator-guest-name';
        var el = document.getElementById(nameId);
        return el && el.textContent ? el.textContent : (player === 'host' ? 'P1' : 'P2');
      }

      // ── Timer helpers ───────────────────────────────────────────────────────

      function _spectatorStartTimer() {
        if (_spectatorTimerRaf) return;
        _spectatorTimerLast = performance.now();
        function _tick(now) {
          var delta = now - _spectatorTimerLast;
          _spectatorTimerLast = now;
          _spectatorScoreRaceMs -= delta;
          if (_spectatorScoreRaceMs < 0) _spectatorScoreRaceMs = 0;
          var timerEl = document.getElementById("spectator-match-timer");
          if (timerEl) {
            var s = Math.ceil(_spectatorScoreRaceMs / 1000);
            var mm = Math.floor(s / 60);
            var ss = s % 60;
            timerEl.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
          }
          if (_spectatorScoreRaceMs > 0) {
            _spectatorTimerRaf = requestAnimationFrame(_tick);
          } else {
            _spectatorTimerRaf = null;
          }
        }
        _spectatorTimerRaf = requestAnimationFrame(_tick);
      }

      function _spectatorStopTimer() {
        if (_spectatorTimerRaf) { cancelAnimationFrame(_spectatorTimerRaf); _spectatorTimerRaf = null; }
      }

      // ── Flash animation ─────────────────────────────────────────────────────

      function _spectatorFlashBoard(player) {
        var flashId = player === 'host' ? 'spectator-host-flash' : 'spectator-guest-flash';
        var el = document.getElementById(flashId);
        if (!el) return;
        el.style.transition = 'none';
        el.style.background = 'rgba(255,80,0,0.55)';
        el.style.opacity = '1';
        void el.offsetHeight; // reflow
        el.style.transition = 'opacity 0.55s ease-out';
        el.style.opacity = '0';
      }

      // ── Power-up overlay ────────────────────────────────────────────────────

      function _spectatorShowPowerupOverlay(player, puType) {
        var puId = player === 'host' ? 'spectator-host-pu' : 'spectator-guest-pu';
        var el = document.getElementById(puId);
        if (!el) return;
        var def = _SPEC_PU_DEFS[puType];
        el.textContent = def ? def.icon : '\u26A1';
        el.style.transition = 'none';
        el.style.opacity = '1';
        void el.offsetHeight;
        el.style.transition = 'opacity 0.8s ease-out 0.6s';
        el.style.opacity = '0';
      }

      // ── Event handlers ──────────────────────────────────────────────────────

      function _onSpectatorWelcome(msg) {
        _updateSpectatorCountBadge(msg.spectatorCount || 0);
        var statusEl = document.getElementById("spectator-status-msg");
        if (statusEl) {
          statusEl.textContent = msg.playersConnected >= 2
            ? "Match in progress"
            : "Waiting for players\u2026";
        }
        if (msg.isTournament) {
          var tournCtx = document.getElementById("spectator-tournament-ctx");
          if (tournCtx) tournCtx.style.display = "inline";
        }
      }

      function _onSpectatorStateChange(data) {
        if (data.state === BattleState.DISCONNECTED) {
          _closeSpectatorOverlay();
        }
      }

      function _onSpectatorMatchStart(msg) {
        _spectatorMatchMode = (msg.matchMode || 'survival');
        var modeBadge = document.getElementById("spectator-mode-badge");
        var timerEl = document.getElementById("spectator-match-timer");
        var statusEl = document.getElementById("spectator-status-msg");
        if (_spectatorMatchMode === 'score_race') {
          if (modeBadge) modeBadge.textContent = '\u23F1 SCORE RACE';
          _spectatorScoreRaceMs = 180000;
          if (timerEl) { timerEl.style.display = "block"; timerEl.textContent = "3:00"; }
          _spectatorStartTimer();
          if (statusEl) statusEl.textContent = "Score Race in progress";
          _specTickerAdd("Score Race started — 3 minutes!", null);
        } else {
          if (modeBadge) modeBadge.textContent = '\u2694 SURVIVAL';
          if (timerEl) timerEl.style.display = "none";
          if (statusEl) statusEl.textContent = "Survival match in progress";
          _specTickerAdd("Survival match started!", null);
        }
      }

      function _onSpectatorBattleRating(msg) {
        var from = msg.fromPlayer || 'host';
        var nameId = from === 'host' ? 'spectator-host-name' : 'spectator-guest-name';
        var ratingId = from === 'host' ? 'spectator-host-rating' : 'spectator-guest-rating';
        if (msg.playerName) {
          var nameEl = document.getElementById(nameId);
          if (nameEl) nameEl.textContent = msg.playerName;
        }
        if (typeof msg.rating === 'number') {
          var ratingEl = document.getElementById(ratingId);
          if (ratingEl) ratingEl.textContent = '\u2605 ' + msg.rating;
        }
      }

      // Render a column array to a spectator board canvas
      function _drawSpectatorBoard(canvasId, cols) {
        var canvas = document.getElementById(canvasId);
        if (!canvas || !cols) return;
        var ctx = canvas.getContext("2d");
        var cw = canvas.width, ch = canvas.height;
        ctx.clearRect(0, 0, cw, ch);
        var numCols = cols.length;
        var numRows = numCols > 0 ? cols[0].length : 0;
        if (!numCols || !numRows) return;
        var cellW = cw / numCols;
        var cellH = ch / numRows;
        for (var c = 0; c < numCols; c++) {
          for (var r = 0; r < numRows; r++) {
            var cell = cols[c][r];
            if (cell) {
              ctx.fillStyle = typeof cell === 'string' ? cell : '#4a9eff';
              ctx.fillRect(c * cellW + 1, r * cellH + 1, cellW - 2, cellH - 2);
            }
          }
        }
      }

      function _onSpectatorBattleBoard(msg) {
        var statusEl = document.getElementById("spectator-status-msg");
        if (statusEl && statusEl.textContent.indexOf("Waiting") !== -1) {
          statusEl.textContent = "Match in progress";
        }
        var from = msg.fromPlayer || 'host';
        var scoreId = from === 'host' ? 'spectator-host-score' : 'spectator-guest-score';
        var linesId = from === 'host' ? 'spectator-host-lines' : 'spectator-guest-lines';
        var boardId = from === 'host' ? 'spectator-host-board' : 'spectator-guest-board';
        var scoreEl = document.getElementById(scoreId);
        var linesEl = document.getElementById(linesId);
        if (scoreEl) scoreEl.textContent = msg.score != null ? msg.score : '\u2014';
        if (linesEl) linesEl.textContent = msg.linesCleared != null ? msg.linesCleared : '\u2014';
        _drawSpectatorBoard(boardId, msg.cols);
      }

      function _onSpectatorBattleAttack(msg) {
        // Garbage was sent — flash the recipient's board
        var attacker = msg.fromPlayer || 'host';
        var recipient = attacker === 'host' ? 'guest' : 'host';
        var lines = msg.lines || 0;
        _spectatorFlashBoard(recipient);
        var attackerLabel = _specPlayerLabel(attacker);
        var recipientLabel = _specPlayerLabel(recipient);
        var lineWord = lines === 1 ? 'row' : 'rows';
        _specTickerAdd(attackerLabel + ' sent ' + lines + ' garbage ' + lineWord + ' \u2192 ' + recipientLabel, attacker);
      }

      function _onSpectatorBattlePowerup(msg) {
        var from = msg.fromPlayer || 'host';
        var puType = msg.powerUp || '';
        _spectatorShowPowerupOverlay(from, puType);
        var def = _SPEC_PU_DEFS[puType];
        var puName = def ? def.name : 'Power-up';
        var icon = def ? def.icon : '\u26A1';
        _specTickerAdd(_specPlayerLabel(from) + ' activated ' + icon + ' ' + puName, from);
      }

      function _onSpectatorGameOver(msg) {
        var from = msg.fromPlayer || 'host';
        var loserName = _specPlayerLabel(from);
        var winnerName = _specPlayerLabel(from === 'host' ? 'guest' : 'host');
        _spectatorStopTimer();
        _specTickerAdd(loserName + ' was eliminated!', from);
        _showSpectatorResult(winnerName + " wins!", loserName + " was eliminated");
      }

      function _onSpectatorScoreRaceEnd(msg) {
        _spectatorStopTimer();
        var from = msg.fromPlayer || 'host';
        var label = _specPlayerLabel(from);
        _specTickerAdd("Score Race ended — " + label + " submitted final score", from);
        _showSpectatorResult("Score Race ended!", "Final score submitted by " + label);
      }

      function _onSpectatorPlayerLeft(msg) {
        _spectatorStopTimer();
        var statusEl = document.getElementById("spectator-status-msg");
        if (statusEl) statusEl.textContent = "A player disconnected.";
        _specTickerAdd("A player disconnected", null);
        _showSpectatorResult("Match ended", "A player disconnected");
      }

      function _showSpectatorResult(title, sub) {
        var resultEl = document.getElementById("spectator-result");
        var titleEl = document.getElementById("spectator-result-title");
        var subEl = document.getElementById("spectator-result-sub");
        var countEl = document.getElementById("spectator-result-countdown");
        if (!resultEl) return;
        if (titleEl) titleEl.textContent = title;
        if (subEl) subEl.textContent = sub;
        resultEl.style.display = "block";
        if (typeof onSeasonMissionMatchWatched === 'function') onSeasonMissionMatchWatched();
        var secs = 5;
        if (countEl) countEl.textContent = "Returning to lobby in " + secs + "s\u2026";
        _spectatorResultTimer = setInterval(function () {
          secs--;
          if (secs <= 0) {
            clearInterval(_spectatorResultTimer);
            _spectatorResultTimer = null;
            _closeSpectatorOverlay();
          } else {
            if (countEl) countEl.textContent = "Returning to lobby in " + secs + "s\u2026";
          }
        }, 1000);
      }

      var spectatorLeaveBtn = document.getElementById("spectator-leave-btn");
      if (spectatorLeaveBtn) {
        spectatorLeaveBtn.addEventListener("click", function () { _closeSpectatorOverlay(); });
      }

      // ── Spectator Engagement: Hype Bar, Emoji Reactions, Chat ───────────────

      var EMOJI_MAP = {
        fire:    '\uD83D\uDD25',
        clap:    '\uD83D\uDC4F',
        shocked: '\uD83D\uDE32',
        skull:   '\uD83D\uDC80',
        diamond: '\uD83D\uDC8E',
        crown:   '\uD83D\uDC51',
      };

      // Hype bar state
      var _hypeLevel     = 0;   // 0–100
      var _hypeRafId     = null;
      var _hypeLastTs    = 0;
      var _hypeElectric  = false;
      var _hypeElectricTimer = null;

      function _updateHypeBar() {
        var fill = document.getElementById('spec-hype-fill');
        var pct  = document.getElementById('spec-hype-pct');
        if (fill) fill.style.width = _hypeLevel.toFixed(1) + '%';
        if (pct)  pct.textContent  = Math.round(_hypeLevel) + '%';
      }

      function _hypeDecayTick(ts) {
        if (_hypeLastTs) {
          var dt = (ts - _hypeLastTs) / 1000;
          _hypeLevel = Math.max(0, _hypeLevel - 2 * dt);
          _updateHypeBar();
        }
        _hypeLastTs = ts;
        _hypeRafId = requestAnimationFrame(_hypeDecayTick);
      }

      function _startHypeDecay() {
        if (_hypeRafId) return;
        _hypeLastTs = 0;
        _hypeRafId = requestAnimationFrame(_hypeDecayTick);
      }

      function _stopHypeDecay() {
        if (_hypeRafId) { cancelAnimationFrame(_hypeRafId); _hypeRafId = null; }
      }

      function _addHypeReaction() {
        _hypeLevel = Math.min(100, _hypeLevel + 5);
        _updateHypeBar();
        if (_hypeLevel >= 100 && !_hypeElectric) {
          _triggerHypeElectric();
        }
      }

      function _triggerHypeElectric() {
        _hypeElectric = true;
        var overlay = document.getElementById('spectator-overlay');
        var banner  = document.getElementById('spec-electric-banner');
        if (overlay) overlay.classList.add('hype-electric');
        if (banner)  banner.style.display = 'block';
        if (_hypeElectricTimer) clearTimeout(_hypeElectricTimer);
        _hypeElectricTimer = setTimeout(function () {
          _hypeElectric = false;
          if (overlay) overlay.classList.remove('hype-electric');
          if (banner)  banner.style.display = 'none';
          _hypeElectricTimer = null;
        }, 3000);
      }

      // Floating emoji animation
      function _spawnFloatingEmoji(emojiChar) {
        var layer = document.getElementById('spec-emoji-float-layer');
        if (!layer) return;
        var el = document.createElement('div');
        el.className = 'spec-floating-emoji';
        el.textContent = emojiChar;
        var xPct = 10 + Math.random() * 80;
        el.style.left  = xPct + '%';
        el.style.bottom = '80px';
        layer.appendChild(el);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1900);
      }

      // Reaction button rate limiting
      var _lastReactionTime = 0;

      document.querySelectorAll('.spec-react-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!battle.isSpectator) return;
          var now = Date.now();
          if (now - _lastReactionTime < 2000) return; // rate limited
          _lastReactionTime = now;
          var emoji = btn.getAttribute('data-emoji');
          // Send to server
          battle.send({ type: 'spectator_reaction', emoji: emoji });
          // Optimistically spawn local animation + add hype
          _spawnFloatingEmoji(EMOJI_MAP[emoji] || emoji);
          _addHypeReaction();
          if (typeof onSeasonMissionHypeReactionSent === 'function') onSeasonMissionHypeReactionSent();
          // Brief button cooldown indicator
          btn.classList.add('rate-limited');
          setTimeout(function () { btn.classList.remove('rate-limited'); }, 2000);
        });
      });

      // Handle incoming reactions (from server relay)
      function _onSpectatorReaction(msg) {
        var emoji = msg.emoji;
        var char  = EMOJI_MAP[emoji];
        if (!char) return;
        _spawnFloatingEmoji(char);
        _addHypeReaction();
      }

      // Spectator chat
      var _specMySpecId = null;
      var _specMyName   = (function () {
        // Use saved display name if available, else 'Spectator'
        try {
          var n = localStorage.getItem('mineCtris_displayName') || '';
          return n.trim().slice(0, 24) || 'Spectator';
        } catch (_) { return 'Spectator'; }
      })();

      var _specKnownSpectators = {}; // specId → name

      function _specChatRender(name, text, isSelf) {
        var msgs = document.getElementById('spec-chat-messages');
        if (!msgs) return;
        var div = document.createElement('div');
        div.className = 'spec-chat-msg';
        var nameSpan = document.createElement('span');
        nameSpan.className = 'spec-chat-name';
        nameSpan.textContent = (isSelf ? '(you) ' : '') + name + ':';
        if (isSelf) nameSpan.style.color = '#ffd700';
        div.appendChild(nameSpan);
        div.appendChild(document.createTextNode(' ' + text));
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
        // Keep max 80 messages
        while (msgs.children.length > 80) msgs.removeChild(msgs.firstChild);
      }

      function _specUpdateSpectatorList() {
        var names  = Object.values(_specKnownSpectators).filter(Boolean);
        var countEl = document.getElementById('spec-chat-spectator-count');
        var namesEl = document.getElementById('spec-chat-spectator-names');
        if (countEl) countEl.textContent = names.length + ' spectator' + (names.length !== 1 ? 's' : '');
        if (namesEl) namesEl.textContent = names.slice(0, 5).join(', ') + (names.length > 5 ? '\u2026' : '');
      }

      var _profanityList = ['fuck','shit','ass','bitch','cunt','nigger','nigga','dick','pussy','bastard'];
      function _filterProfanity(text) {
        var out = text;
        _profanityList.forEach(function (w) {
          out = out.replace(new RegExp('\\b' + w + '\\b', 'gi'), function (m) {
            return m[0] + '*'.repeat(m.length - 1);
          });
        });
        return out;
      }

      function _specSendChat() {
        if (!battle.isSpectator) return;
        var input = document.getElementById('spec-chat-input');
        if (!input) return;
        var raw  = input.value.trim().slice(0, 100);
        if (!raw) return;
        var text = _filterProfanity(raw);
        battle.send({ type: 'spectator_chat', text: text, name: _specMyName });
        _specChatRender(_specMyName, text, true);
        input.value = '';
      }

      var specChatSend = document.getElementById('spec-chat-send');
      if (specChatSend) specChatSend.addEventListener('click', _specSendChat);

      var specChatInput = document.getElementById('spec-chat-input');
      if (specChatInput) {
        specChatInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); _specSendChat(); }
        });
      }

      // Chat panel collapse/expand
      var _chatCollapsed = false;
      var specChatToggle = document.getElementById('spec-chat-toggle');
      if (specChatToggle) {
        specChatToggle.addEventListener('click', function () {
          _chatCollapsed = !_chatCollapsed;
          var panel = document.getElementById('spec-chat-panel');
          var arrow = document.getElementById('spec-chat-toggle-arrow');
          if (panel) panel.classList.toggle('collapsed', _chatCollapsed);
          if (arrow) arrow.textContent = _chatCollapsed ? '\u25BA' : '\u25C4';
        });
      }

      // Handle incoming chat messages
      function _onSpectatorChat(msg) {
        if (!msg.text) return;
        var isSelf = msg.specId === _specMySpecId;
        if (!isSelf) {  // own messages already rendered optimistically
          _specChatRender(msg.name || 'Anon', msg.text, false);
        }
      }

      // Handle spectator hello (name registration)
      function _onSpectatorHello(msg) {
        if (msg.specId && msg.name) {
          _specKnownSpectators[msg.specId] = msg.name;
          _specUpdateSpectatorList();
        }
      }

      // Enhance spectator welcome to grab mySpecId and init name
      var _origOnSpectatorWelcome = _onSpectatorWelcome;
      function _onSpectatorWelcomeEnhanced(msg) {
        _origOnSpectatorWelcome(msg);
        if (msg.mySpecId) {
          _specMySpecId = msg.mySpecId;
          _specKnownSpectators[_specMySpecId] = _specMyName;
          _specUpdateSpectatorList();
          // Announce ourselves to other spectators
          battle.send({ type: 'spectator_hello', name: _specMyName });
        }
        // Update spectator count in chat header
        _specUpdateSpectatorList();
      }

      // Register enhanced welcome + new events in _openSpectatorOverlay
      // (patched below)

      // Player hype indicator — shown to in-game players when spectators react
      battle.on('spectator_hype_tick', function () {
        var el = document.getElementById('battle-spectator-hype');
        if (!el) return;
        el.style.display = 'block';
        el.textContent = '\uD83D\uDD25 Crowd reacting!';
        if (el._fadeTimer) clearTimeout(el._fadeTimer);
        el._fadeTimer = setTimeout(function () {
          el.style.display = 'none';
        }, 3000);
      });

      // Patch _openSpectatorOverlay to register new events and start hype decay
      var _origOpenSpectatorOverlay = _openSpectatorOverlay;
      _openSpectatorOverlay = function (roomCode) {
        _origOpenSpectatorOverlay(roomCode);
        // Reset hype state
        _hypeLevel = 0;
        _hypeElectric = false;
        if (_hypeElectricTimer) { clearTimeout(_hypeElectricTimer); _hypeElectricTimer = null; }
        var overlay = document.getElementById('spectator-overlay');
        if (overlay) overlay.classList.remove('hype-electric');
        var banner = document.getElementById('spec-electric-banner');
        if (banner) banner.style.display = 'none';
        _updateHypeBar();
        _startHypeDecay();
        // Reset chat
        _chatCollapsed = false;
        var panel = document.getElementById('spec-chat-panel');
        if (panel) panel.classList.remove('collapsed');
        var msgs = document.getElementById('spec-chat-messages');
        if (msgs) msgs.innerHTML = '';
        _specKnownSpectators = {};
        _specMySpecId = null;
        _specUpdateSpectatorList();
        // Re-register with enhanced welcome
        battle.off('spectator_welcome', _onSpectatorWelcome);
        battle.on('spectator_welcome',  _onSpectatorWelcomeEnhanced);
        battle.on('spectator_reaction', _onSpectatorReaction);
        battle.on('spectator_chat',     _onSpectatorChat);
        battle.on('spectator_hello',    _onSpectatorHello);
      };

      // Patch _closeSpectatorOverlay to unregister and stop hype
      var _origCloseSpectatorOverlay = _closeSpectatorOverlay;
      _closeSpectatorOverlay = function () {
        _stopHypeDecay();
        if (_hypeElectricTimer) { clearTimeout(_hypeElectricTimer); _hypeElectricTimer = null; }
        battle.off('spectator_welcome',  _onSpectatorWelcomeEnhanced);
        battle.off('spectator_reaction', _onSpectatorReaction);
        battle.off('spectator_chat',     _onSpectatorChat);
        battle.off('spectator_hello',    _onSpectatorHello);
        _origCloseSpectatorOverlay();
      };

      // ── End Spectator Engagement ─────────────────────────────────────────────

      // ── Mode toggle (host only in ready view) ──
      var _battleModeSurvivalBtn  = document.getElementById("battle-mode-survival-btn");
      var _battleModeScoreRaceBtn = document.getElementById("battle-mode-score-race-btn");
      var _battleModeToggleHost   = document.getElementById("battle-mode-toggle-host");
      var _battleModeDisplayGuest = document.getElementById("battle-mode-display-guest");

      function _setBattleMode(mode) {
        _battleSelectedMode = mode;
        if (_battleModeSurvivalBtn)  _battleModeSurvivalBtn.classList.toggle('active',  mode === 'survival');
        if (_battleModeScoreRaceBtn) _battleModeScoreRaceBtn.classList.toggle('active', mode === 'score_race');
        if (_battleModeDisplayGuest) {
          _battleModeDisplayGuest.textContent = mode === 'score_race' ? '\u23f1 Score Race' : '\u2694 Survival';
        }
      }

      if (_battleModeSurvivalBtn) {
        _battleModeSurvivalBtn.addEventListener("click", function () {
          _setBattleMode('survival');
          battle.send({ type: 'battle_mode', mode: 'survival' });
        });
      }
      if (_battleModeScoreRaceBtn) {
        _battleModeScoreRaceBtn.addEventListener("click", function () {
          _setBattleMode('score_race');
          battle.send({ type: 'battle_mode', mode: 'score_race' });
        });
      }

      // Guest receives live mode updates from host
      battle.on("battle_mode", function (msg) {
        if (battle.isHost) return;
        _battleSelectedMode = msg.mode || 'survival';
        if (_battleModeDisplayGuest) {
          _battleModeDisplayGuest.textContent = _battleSelectedMode === 'score_race' ? '\u23f1 Score Race' : '\u2694 Survival';
        }
      });

      // When entering ready view, show appropriate mode controls
      function _setupReadyViewModeUI() {
        if (battle.isHost) {
          if (_battleModeToggleHost)   _battleModeToggleHost.style.display   = '';
          if (_battleModeDisplayGuest) _battleModeDisplayGuest.style.display = 'none';
          // Show private toggle for host (unless tournament match)
          if (_privateToggleEl) _privateToggleEl.style.display = isTournamentMatch ? 'none' : '';
          if (_privateCheckbox)  _privateCheckbox.checked = false;
          // Tournament rooms are always spectatable — notify server
          if (isTournamentMatch) {
            battle.send({ type: 'room_set_tournament' });
          }
        } else {
          if (_battleModeToggleHost)   _battleModeToggleHost.style.display   = 'none';
          if (_battleModeDisplayGuest) _battleModeDisplayGuest.style.display = '';
          _battleSelectedMode = 'survival';
          if (_battleModeDisplayGuest) _battleModeDisplayGuest.textContent = '\u2694 Survival';
          if (_privateToggleEl) _privateToggleEl.style.display = 'none';
        }
        _updateSpectatorCountDisplay();
      }

      // Opponent score race end: opponent's timer expired; resolve if ours hasn't
      battle.on("battle_score_race_end", function (msg) {
        if (isGameOver || battleMatchMode !== 'score_race') return;
        battleOpponentScore = msg.score || 0;
        battleOpponentLines = msg.linesCleared || 0;
        if (msg && msg.stats) battleOpponentStats = msg.stats;
        if (battleScoreRaceRemainingMs > 0) {
          // Freeze our timer and resolve now
          battleScoreRaceRemainingMs = 0;
          if (typeof _updateScoreRaceTimerHud === 'function') _updateScoreRaceTimerHud();
          if (typeof _resolveScoreRace === 'function') {
            _resolveScoreRace(score, linesCleared, battleOpponentScore, battleOpponentLines);
          }
        }
        // If our timer already hit 0, triggerBattleResult was already called — no-op
      });

    })();
}