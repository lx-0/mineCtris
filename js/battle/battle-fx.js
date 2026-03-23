// js/battle-fx.js — Battle mode visual/audio feedback effects.
// Requires: audio.js (audioReady, rumbleSynth, stormSwooshSynth, Tone)
//
// Public API:
//   battleFx.showIncomingAttack(lines)       — red vignette + thud SFX
//   battleFx.showOutgoingAttack(lines)       — orange-red particle streak + whoosh SFX
//   battleFx.showRubbleShake(lines)          — camera jolt on rubble landing
//   battleFx.flashNewRubbleBlocks(blocks)    — white emissive flash on new rubble
//   battleFx.showKOScreen(result, onDone)    — KO/Victory pre-result overlay (~2.5s)
//   battleFx.showComboFeed(combo, rows)      — combo bonus toast above playfield

const battleFx = (function () {
  // ── Lazy DOM refs ────────────────────────────────────────────────────────────
  let _incomingEl   = null;
  let _streakCanvas = null;
  let _streakCtx    = null;
  let _koOverlay    = null;
  let _koTitle      = null;
  let _koConfCanvas = null;
  let _koConfCtx    = null;
  let _comboFeedEl  = null;
  let _built        = false;

  // ── Particle animation state ──────────────────────────────────────────────────
  let _streakParticles = [];
  let _streakRaf       = null;
  let _confParticles   = [];
  let _confRaf         = null;

  // ── DOM init ──────────────────────────────────────────────────────────────────
  function _ensureDOM() {
    if (_built) return;
    _built = true;
    _incomingEl   = document.getElementById('battle-incoming-flash');
    _streakCanvas = document.getElementById('battle-streak-canvas');
    _koOverlay    = document.getElementById('battle-ko-overlay');
    _koTitle      = document.getElementById('battle-ko-title');
    _koConfCanvas = document.getElementById('battle-ko-confetti');
    _comboFeedEl  = document.getElementById('battle-combo-feed');
    if (_streakCanvas) _streakCtx = _streakCanvas.getContext('2d');
    if (_koConfCanvas) _koConfCtx  = _koConfCanvas.getContext('2d');
  }

  // ── 1. Incoming attack vignette flash ─────────────────────────────────────────
  /**
   * Flash a red vignette at screen edges for 0.5 s.
   * Intensity scales with garbage size: 1-2 rows = subtle, 3-5 = medium, 6+ = intense.
   * Also plays a deep thud SFX via Tone.js rumbleSynth.
   * @param {number} lines  Incoming garbage row count.
   */
  function showIncomingAttack(lines) {
    _ensureDOM();
    if (!_incomingEl) return;

    const cls = lines <= 2 ? 'bfx-in-subtle'
              : lines <= 5 ? 'bfx-in-medium'
              : 'bfx-in-intense';
    _incomingEl.className = cls;
    _incomingEl.style.display = 'block';
    // Restart the CSS animation by briefly removing it
    _incomingEl.style.animation = 'none';
    void _incomingEl.offsetWidth;
    _incomingEl.style.animation = '';

    _incomingEl.addEventListener('animationend', function cb() {
      _incomingEl.style.display = 'none';
      _incomingEl.removeEventListener('animationend', cb);
    }, { once: true });

    // Deep thud SFX — scale pitch with garbage size
    if (typeof audioReady !== 'undefined' && audioReady &&
        typeof rumbleSynth !== 'undefined' && rumbleSynth &&
        typeof Tone !== 'undefined') {
      const pitch = lines <= 2 ? 'C2' : (lines <= 5 ? 'A1' : 'F1');
      rumbleSynth.triggerAttackRelease(pitch, '8n', Tone.now());
    }
  }

  // ── 2. Outgoing attack particle streak ────────────────────────────────────────
  /**
   * Shoot orange-red particles upward off-screen when garbage is sent.
   * Particle count scales with garbage size. Also plays a whoosh SFX.
   * @param {number} lines  Outgoing garbage row count.
   */
  function showOutgoingAttack(lines) {
    _ensureDOM();
    if (!_streakCanvas || !_streakCtx) return;

    const gc = document.getElementById('game-container');
    const W  = gc ? gc.clientWidth  : window.innerWidth;
    const H  = gc ? gc.clientHeight : window.innerHeight;
    _streakCanvas.width  = W;
    _streakCanvas.height = H;
    _streakCanvas.style.display = 'block';

    const count = Math.min(lines * 4, 32);
    _streakParticles = [];
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const life   = 0.4 + Math.random() * 0.35;
      _streakParticles.push({
        x:       W * 0.5 + (Math.random() - 0.5) * 100,
        y:       H * 0.78,
        vx:      Math.sin(spread) * (300 + Math.random() * 300),
        vy:      -(400 + Math.random() * 500),
        life:    life,
        maxLife: life,
        size:    2 + Math.random() * 4,
        g:       Math.floor(50 + Math.random() * 100), // orange range
      });
    }

    if (_streakRaf) { cancelAnimationFrame(_streakRaf); _streakRaf = null; }
    let prevT = performance.now();
    function _tick(t) {
      const dt = Math.min((t - prevT) / 1000, 0.05);
      prevT = t;
      _streakCtx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of _streakParticles) {
        p.x   += p.vx * dt;
        p.y   += p.vy * dt;
        p.vy  += 250 * dt; // light gravity
        p.life -= dt;
        if (p.life > 0) {
          alive = true;
          const a = p.life / p.maxLife;
          _streakCtx.globalAlpha = a * 0.9;
          _streakCtx.fillStyle   = 'rgb(255,' + p.g + ',0)';
          _streakCtx.beginPath();
          _streakCtx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
          _streakCtx.fill();
        }
      }
      _streakCtx.globalAlpha = 1;
      if (alive) {
        _streakRaf = requestAnimationFrame(_tick);
      } else {
        _streakCanvas.style.display = 'none';
        _streakRaf = null;
      }
    }
    _streakRaf = requestAnimationFrame(_tick);

    // Rising whoosh SFX — pitch scales with garbage size
    if (typeof audioReady !== 'undefined' && audioReady &&
        typeof stormSwooshSynth !== 'undefined' && stormSwooshSynth &&
        typeof Tone !== 'undefined') {
      const note = lines >= 6 ? 'A5' : (lines >= 4 ? 'G5' : 'E5');
      stormSwooshSynth.triggerAttackRelease(note, '8n', Tone.now());
    }
  }

  // ── 3. Camera shake on rubble landing ─────────────────────────────────────────
  /**
   * Apply a brief shake to #game-container when rubble rows land.
   * @param {number} lines  Number of rubble rows injected.
   */
  function showRubbleShake(lines) {
    const gc = document.getElementById('game-container');
    if (!gc) return;
    const cls = lines >= 6 ? 'bfx-shake-strong'
              : lines >= 3 ? 'bfx-shake-medium'
              : 'bfx-shake-light';
    gc.classList.remove('bfx-shake-light', 'bfx-shake-medium', 'bfx-shake-strong');
    void gc.offsetWidth;
    gc.classList.add(cls);
    gc.addEventListener('animationend', function cb() {
      gc.classList.remove('bfx-shake-light', 'bfx-shake-medium', 'bfx-shake-strong');
      gc.removeEventListener('animationend', cb);
    }, { once: true });
  }

  // ── 4. Rubble block emissive flash ────────────────────────────────────────────
  /**
   * Briefly flash newly spawned rubble blocks white, then restore rubble emissive.
   * @param {THREE.Mesh[]} blocks  Array of newly created rubble meshes.
   */
  function flashNewRubbleBlocks(blocks) {
    if (!blocks || !blocks.length) return;
    for (const b of blocks) {
      if (b.material) {
        b.material.emissive.setRGB(1, 1, 1);
        b.material.emissiveIntensity = 2.0;
      }
    }
    // Reset after 250 ms — white flash → rubble orange emissive
    setTimeout(function () {
      for (const b of blocks) {
        if (b.material) {
          b.material.emissive.setHex(0x3d1a00);
          b.material.emissiveIntensity = 0.15;
        }
      }
    }, 250);
  }

  // ── 5. KO / Victory pre-result overlay ────────────────────────────────────────
  /**
   * Show a full-screen KO or Victory overlay before the post-match summary.
   * Fades in over 0.5s, holds for 1.5s, fades out 0.4s = ~2.4s total.
   * Victory screen also spawns a confetti particle burst.
   * @param {'win'|'loss'|'draw'} result
   * @param {Function} onDone  Called when overlay finishes fading out.
   */
  function showKOScreen(result, onDone) {
    _ensureDOM();
    if (!_koOverlay || !_koTitle) { if (onDone) onDone(); return; }

    if (result === 'win') {
      _koTitle.textContent = 'VICTORY!';
      _koOverlay.className = 'bfx-ko-win';
    } else if (result === 'loss') {
      _koTitle.textContent = 'KO';
      _koOverlay.className = 'bfx-ko-loss';
    } else {
      _koTitle.textContent = 'DRAW';
      _koOverlay.className = 'bfx-ko-draw';
    }

    _koOverlay.style.opacity = '0';
    _koOverlay.style.display = 'flex';
    _koOverlay.style.transition = 'opacity 0.5s ease';
    void _koOverlay.offsetWidth;
    _koOverlay.style.opacity = '1';

    if (result === 'win') _spawnConfetti();

    // Hold for 2s from start of fade-in, then fade out
    setTimeout(function () {
      _koOverlay.style.transition = 'opacity 0.4s ease';
      _koOverlay.style.opacity = '0';
      setTimeout(function () {
        _koOverlay.style.display = 'none';
        _koOverlay.style.transition = '';
        if (_koConfCanvas) _koConfCanvas.style.display = 'none';
        if (_confRaf) { cancelAnimationFrame(_confRaf); _confRaf = null; }
        if (onDone) onDone();
      }, 400);
    }, 2000);
  }

  function _spawnConfetti() {
    if (!_koConfCanvas || !_koConfCtx) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    _koConfCanvas.width  = W;
    _koConfCanvas.height = H;
    _koConfCanvas.style.display = 'block';

    const COLORS = ['#ffd700', '#ff6600', '#00ff88', '#44aaff', '#ff44cc', '#ffffff'];
    _confParticles = [];
    for (let i = 0; i < 90; i++) {
      const life = 2.0 + Math.random() * 0.5;
      _confParticles.push({
        x:       Math.random() * W,
        y:       -10 - Math.random() * 80,
        vx:      (Math.random() - 0.5) * 180,
        vy:      100 + Math.random() * 220,
        rot:     Math.random() * Math.PI * 2,
        rotV:    (Math.random() - 0.5) * 7,
        w:       5 + Math.random() * 8,
        h:       2.5 + Math.random() * 4,
        color:   COLORS[Math.floor(Math.random() * COLORS.length)],
        life:    life,
        maxLife: life,
      });
    }

    if (_confRaf) { cancelAnimationFrame(_confRaf); _confRaf = null; }
    let prev = performance.now();
    function _tick(t) {
      const dt = Math.min((t - prev) / 1000, 0.05);
      prev = t;
      _koConfCtx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of _confParticles) {
        p.x   += p.vx * dt;
        p.y   += p.vy * dt;
        p.rot += p.rotV * dt;
        p.life -= dt;
        if (p.life > 0) {
          alive = true;
          _koConfCtx.save();
          _koConfCtx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 1.8);
          _koConfCtx.translate(p.x, p.y);
          _koConfCtx.rotate(p.rot);
          _koConfCtx.fillStyle = p.color;
          _koConfCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          _koConfCtx.restore();
        }
      }
      if (alive) {
        _confRaf = requestAnimationFrame(_tick);
      } else {
        _confRaf = null;
      }
    }
    _confRaf = requestAnimationFrame(_tick);
  }

  // ── 6. Combo feed toast ───────────────────────────────────────────────────────
  /**
   * Show a brief "Combo ×N → +N attack!" toast above the playfield in battle mode.
   * @param {number} combo  Current comboCount (≥ 2 to show).
   */
  function showComboFeed(combo) {
    _ensureDOM();
    if (!_comboFeedEl) return;
    const comboBonus = Math.min(combo - 1, 3);
    _comboFeedEl.textContent = 'Combo \xd7' + combo + ' \u2192 +' + comboBonus + ' attack!';
    _comboFeedEl.style.display = 'block';
    _comboFeedEl.style.animation = 'none';
    void _comboFeedEl.offsetWidth;
    _comboFeedEl.style.animation = '';
    _comboFeedEl.addEventListener('animationend', function cb() {
      _comboFeedEl.style.display = 'none';
      _comboFeedEl.removeEventListener('animationend', cb);
    }, { once: true });
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  return {
    showIncomingAttack,
    showOutgoingAttack,
    showRubbleShake,
    flashNewRubbleBlocks,
    showKOScreen,
    showComboFeed,
  };
})();
