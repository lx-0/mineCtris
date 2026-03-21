// js/battle-hud.js — Opponent mini-map HUD for Battle mode.
// Shows opponent column heights, connection status, score/level, and garbage warning.
// Renders as a simple Canvas 2D element overlaid on the Three.js canvas.

const battleHud = (function () {
  const NUM_COLS     = 10;
  const CANVAS_W     = 80;
  const CANVAS_H     = 80;   // bar chart area
  const MAX_HEIGHT   = 20;   // GAME_OVER_HEIGHT grid units

  let _el           = null;
  let _canvas       = null;
  let _ctx          = null;
  let _dotEl        = null;
  let _scoreEl      = null;
  let _levelEl      = null;
  let _garbageEl    = null;
  let _outgoingEl   = null;  // outgoing attack preview badge

  let _flashTimer    = 0;    // seconds remaining for white-flash animation
  let _garbageTimer  = 0;    // seconds remaining for garbage warning
  let _outgoingTimer = 0;    // seconds remaining for outgoing attack badge
  let _lastCols      = new Array(NUM_COLS).fill(0);

  let _opponentEmblemEl    = null;
  let _opponentSkinId      = null;  // 'stone_brick' | 'nether_brick' | null
  let _opponentBannerColor = null;
  let _opponentIsLegendary = false;

  // ── DOM build ─────────────────────────────────────────────────────────────

  function _build() {
    if (_el) return;

    _el = document.createElement('div');
    _el.id = 'battle-opponent-hud';
    _el.style.display = 'none';

    // Header: label + connection dot + opponent emblem
    const header = document.createElement('div');
    header.className = 'boh-header';
    const lbl = document.createElement('span');
    lbl.className = 'boh-label';
    lbl.textContent = 'OPPONENT';
    _dotEl = document.createElement('span');
    _dotEl.className = 'boh-dot boh-dot-yellow';
    _opponentEmblemEl = document.createElement('span');
    _opponentEmblemEl.className = 'boh-opponent-emblem';
    _opponentEmblemEl.style.display = 'none';
    header.appendChild(lbl);
    header.appendChild(_opponentEmblemEl);
    header.appendChild(_dotEl);
    _el.appendChild(header);

    // Bar-chart canvas
    _canvas = document.createElement('canvas');
    _canvas.width  = CANVAS_W;
    _canvas.height = CANVAS_H;
    _canvas.className = 'boh-canvas';
    _ctx = _canvas.getContext('2d');
    _el.appendChild(_canvas);

    // Stats row: score + level
    const stats = document.createElement('div');
    stats.className = 'boh-stats';
    _scoreEl = document.createElement('span');
    _scoreEl.className = 'boh-score';
    _scoreEl.textContent = '0';
    _levelEl = document.createElement('span');
    _levelEl.className = 'boh-level';
    _levelEl.textContent = 'L1';
    stats.appendChild(_scoreEl);
    stats.appendChild(_levelEl);
    _el.appendChild(stats);

    // Garbage-incoming bar
    _garbageEl = document.createElement('div');
    _garbageEl.className = 'boh-garbage';
    _garbageEl.textContent = '⚠ INCOMING!';
    _garbageEl.style.display = 'none';
    _el.appendChild(_garbageEl);

    // Outgoing attack preview badge (shown briefly after we send an attack)
    _outgoingEl = document.createElement('div');
    _outgoingEl.className = 'boh-outgoing';
    _outgoingEl.style.display = 'none';
    _el.appendChild(_outgoingEl);

    const topRight = document.getElementById('top-right-hud');
    if (topRight) topRight.appendChild(_el);

    _drawBars(_lastCols, false);
  }

  // ── Canvas rendering ──────────────────────────────────────────────────────

  function _drawBars(cols, flashWhite) {
    if (!_ctx) return;
    _ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Brief white flash on opponent line-clear
    if (flashWhite) {
      _ctx.fillStyle = 'rgba(255,255,255,0.9)';
      _ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      return;
    }

    // Background
    _ctx.fillStyle = 'rgba(0,0,0,0.55)';
    _ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const barW   = Math.floor(CANVAS_W / NUM_COLS);   // 8 px per column
    const gap    = 1;
    const usableH = CANVAS_H - 2;

    for (let c = 0; c < NUM_COLS; c++) {
      const raw      = cols[c] || 0;
      const isRubble = raw < 0;
      const height   = Math.abs(raw);
      const barH     = Math.min(Math.round((height / MAX_HEIGHT) * usableH), usableH);
      const x        = c * barW + gap;
      const y        = CANVAS_H - barH - 1;
      const w        = barW - gap * 2;

      const danger = height >= MAX_HEIGHT * 0.75;

      // Column track (dim background)
      _ctx.fillStyle = 'rgba(255,255,255,0.05)';
      _ctx.fillRect(x, 1, w, usableH);

      // Bar fill
      if (barH > 0) {
        if (isRubble) {
          _ctx.fillStyle = danger ? '#d45020' : '#a06030';  // orange-grey rubble
        } else {
          _ctx.fillStyle = danger ? '#cc4444' : '#778899';  // stone-grey normal → red in danger
        }
        _ctx.fillRect(x, y, w, barH);
      }
    }

    // Danger threshold line at 75 %
    const threshY = Math.round(CANVAS_H - 0.75 * usableH) - 1;
    _ctx.strokeStyle = 'rgba(255,80,80,0.5)';
    _ctx.lineWidth   = 1;
    _ctx.setLineDash([3, 3]);
    _ctx.beginPath();
    _ctx.moveTo(0, threshY);
    _ctx.lineTo(CANVAS_W, threshY);
    _ctx.stroke();
    _ctx.setLineDash([]);

    // Board skin tint overlay on opponent mini-map
    if (_opponentSkinId && _opponentSkinId !== 'none') {
      _ctx.save();
      if (_opponentSkinId === 'stone_brick') {
        _ctx.fillStyle = 'rgba(136,136,136,0.15)';
        _ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        // Brick mortar lines (horizontal)
        _ctx.strokeStyle = 'rgba(80,80,80,0.18)';
        _ctx.lineWidth = 1;
        _ctx.setLineDash([]);
        for (let row = 0; row < CANVAS_H; row += 8) {
          _ctx.beginPath();
          _ctx.moveTo(0, row); _ctx.lineTo(CANVAS_W, row);
          _ctx.stroke();
        }
        // Vertical mortar lines (offset per row)
        for (let row = 0; row < CANVAS_H; row += 8) {
          const offset = (Math.floor(row / 8) % 2 === 0) ? 0 : CANVAS_W / 2;
          for (let col = offset; col < CANVAS_W; col += CANVAS_W / 2) {
            _ctx.beginPath();
            _ctx.moveTo(col, row); _ctx.lineTo(col, row + 8);
            _ctx.stroke();
          }
        }
      } else if (_opponentSkinId === 'nether_brick') {
        _ctx.fillStyle = 'rgba(58,10,10,0.20)';
        _ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        _ctx.strokeStyle = 'rgba(30,5,5,0.22)';
        _ctx.lineWidth = 1;
        _ctx.setLineDash([]);
        for (let row = 0; row < CANVAS_H; row += 6) {
          _ctx.beginPath();
          _ctx.moveTo(0, row); _ctx.lineTo(CANVAS_W, row);
          _ctx.stroke();
        }
        for (let row = 0; row < CANVAS_H; row += 6) {
          const offset = (Math.floor(row / 6) % 2 === 0) ? 0 : CANVAS_W / 3;
          for (let col = offset; col < CANVAS_W; col += CANVAS_W / 3) {
            _ctx.beginPath();
            _ctx.moveTo(col, row); _ctx.lineTo(col, row + 6);
            _ctx.stroke();
          }
        }
      }
      _ctx.restore();
    }
  }

  function _setDot(status) {
    if (!_dotEl) return;
    _dotEl.className = 'boh-dot boh-dot-' + status;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {

    /** Call from _startBattleGame() to mount the HUD. */
    show() {
      _build();
      if (_el) _el.style.display = 'block';
      _setDot('yellow');
      _lastCols = new Array(NUM_COLS).fill(0);
      _drawBars(_lastCols, false);
      _flashTimer    = 0;
      _garbageTimer  = 0;
      _outgoingTimer = 0;
      if (_garbageEl)  _garbageEl.style.display  = 'none';
      if (_outgoingEl) _outgoingEl.style.display = 'none';
      // Reset opponent guild state
      _opponentSkinId      = null;
      _opponentBannerColor = null;
      _opponentIsLegendary = false;
      if (_opponentEmblemEl) { _opponentEmblemEl.textContent = ''; _opponentEmblemEl.style.display = 'none'; }
    },

    /** Call when battle ends. */
    hide() {
      if (_el) _el.style.display = 'none';
    },

    /**
     * Per-frame tick. Drives flash and garbage-warning timers.
     * @param {number} delta seconds since last frame
     */
    tick(delta) {
      if (_flashTimer > 0) {
        _flashTimer -= delta;
        if (_flashTimer > 0) {
          _drawBars(_lastCols, true);
        } else {
          _flashTimer = 0;
          _drawBars(_lastCols, false);
        }
      }
      if (_garbageTimer > 0) {
        _garbageTimer -= delta;
        if (_garbageTimer <= 0) {
          _garbageTimer = 0;
          if (_garbageEl) _garbageEl.style.display = 'none';
        }
      }
      if (_outgoingTimer > 0) {
        _outgoingTimer -= delta;
        if (_outgoingTimer <= 0) {
          _outgoingTimer = 0;
          if (_outgoingEl) _outgoingEl.style.display = 'none';
        }
      }
    },

    /**
     * Update mini-map from a battle_board message.
     * @param {number[]} cols  10-element column-height array (negative = rubble)
     * @param {number}   scoreVal
     * @param {number}   levelVal  1-based level number
     */
    update(cols, scoreVal, levelVal) {
      _build();
      if (cols) _lastCols = cols;
      if (_flashTimer <= 0) _drawBars(_lastCols, false);
      if (_scoreEl && scoreVal !== undefined) _scoreEl.textContent = scoreVal;
      if (_levelEl && levelVal !== undefined) _levelEl.textContent = 'L' + levelVal;
    },

    /** 'green' | 'yellow' | 'red' */
    setConnectionStatus(status) {
      _build();
      _setDot(status);
    },

    /**
     * Show the red garbage-incoming bar for 3 seconds.
     * Called when opponent sends a battle_attack message.
     */
    showGarbage() {
      _build();
      if (_garbageEl) _garbageEl.style.display = 'block';
      _garbageTimer = 3.0;
    },

    /** Flash white briefly — triggered by opponent line-clear. */
    flashLineClear() {
      _build();
      _flashTimer = 0.20;
    },

    /**
     * Set the opponent's guild cosmetics (called once when first battle_board arrives).
     * @param {string|null} emblem      Guild emblem emoji
     * @param {string|null} skinId      'stone_brick' | 'nether_brick' | null
     * @param {string|null} bannerColor CSS hex color
     * @param {boolean}     isLegendary Whether guild is level 20 (legendary emblem)
     */
    setOpponentGuild(emblem, skinId, bannerColor, isLegendary) {
      _build();
      _opponentSkinId      = skinId || null;
      _opponentBannerColor = bannerColor || null;
      _opponentIsLegendary = !!isLegendary;
      if (_opponentEmblemEl) {
        if (emblem) {
          _opponentEmblemEl.textContent = emblem;
          _opponentEmblemEl.className = 'boh-opponent-emblem' + (isLegendary ? ' boh-opponent-emblem--legendary' : '');
          _opponentEmblemEl.style.display = 'inline';
        } else {
          _opponentEmblemEl.textContent = '';
          _opponentEmblemEl.style.display = 'none';
        }
      }
      // Redraw mini-map to apply/remove skin tint
      if (_flashTimer <= 0) _drawBars(_lastCols, false);
    },

    /**
     * Show the outgoing attack preview badge for 2 seconds.
     * Called when we send a battle_attack to the opponent.
     * @param {number} rows  Number of garbage rows we are sending.
     */
    showOutgoingAttack(rows) {
      _build();
      if (_outgoingEl) {
        _outgoingEl.textContent = '▶ ' + rows + ' ROW' + (rows === 1 ? '' : 'S');
        // Force animation restart by toggling display (triggers reflow)
        _outgoingEl.style.display = 'none';
        void _outgoingEl.offsetWidth;
        _outgoingEl.style.display = 'block';
      }
      _outgoingTimer = 2.0;
    },
  };
})();
