// js/battle-hud.js — Opponent mini-map HUD for Battle mode.
// Shows opponent column heights, connection status, score/level, and garbage warning.
// Renders as a simple Canvas 2D element overlaid on the Three.js canvas.

const battleHud = (function () {
  const NUM_COLS     = 10;
  const CANVAS_W     = 80;
  const CANVAS_H     = 80;   // bar chart area
  const MAX_HEIGHT   = 20;   // GAME_OVER_HEIGHT grid units

  let _el          = null;
  let _canvas      = null;
  let _ctx         = null;
  let _dotEl       = null;
  let _scoreEl     = null;
  let _levelEl     = null;
  let _garbageEl   = null;

  let _flashTimer   = 0;     // seconds remaining for white-flash animation
  let _garbageTimer = 0;     // seconds remaining for garbage warning
  let _lastCols     = new Array(NUM_COLS).fill(0);

  // ── DOM build ─────────────────────────────────────────────────────────────

  function _build() {
    if (_el) return;

    _el = document.createElement('div');
    _el.id = 'battle-opponent-hud';
    _el.style.display = 'none';

    // Header: label + connection dot
    const header = document.createElement('div');
    header.className = 'boh-header';
    const lbl = document.createElement('span');
    lbl.className = 'boh-label';
    lbl.textContent = 'OPPONENT';
    _dotEl = document.createElement('span');
    _dotEl.className = 'boh-dot boh-dot-yellow';
    header.appendChild(lbl);
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
      _flashTimer   = 0;
      _garbageTimer = 0;
      if (_garbageEl) _garbageEl.style.display = 'none';
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
  };
})();
