// Biome rules QA test suite.
// Run from browser console: biomeRulesTest.run()
// Requires biome-rules.js to be loaded.

var biomeRulesTest = (function () {
  'use strict';

  var _pass = 0;
  var _fail = 0;
  var _results = [];

  function assert(label, condition) {
    if (condition) {
      _pass++;
      _results.push('  ✓ ' + label);
    } else {
      _fail++;
      _results.push('  ✗ FAIL: ' + label);
    }
  }

  function assertEqual(label, actual, expected) {
    var ok = actual === expected;
    if (!ok) {
      _results.push('  ✗ FAIL: ' + label +
        ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
      _fail++;
    } else {
      _results.push('  ✓ ' + label);
      _pass++;
    }
  }

  function describe(name, fn) {
    _results.push('\n[' + name + ']');
    fn();
  }

  function run() {
    _pass = 0; _fail = 0; _results = [];

    // ── Prerequisite check ────────────────────────────────────────────────────
    if (typeof applyBiomeRules !== 'function' ||
        typeof clearBiomeRules !== 'function' ||
        typeof getActiveBiomeRules !== 'function' ||
        typeof getLineClearCellsNeeded !== 'function' ||
        typeof getBiomeFallSpeedMult !== 'function' ||
        typeof getBiomeLockDelaySecs !== 'function' ||
        typeof getBiomeLockDrift !== 'function') {
      console.error('[biome-rules-test] biome-rules.js is not loaded. Aborting.');
      return;
    }

    // ── No biome (default) ────────────────────────────────────────────────────
    describe('No active biome (default state)', function () {
      clearBiomeRules();
      assert('getActiveBiomeRules() is null',   getActiveBiomeRules() === null);
      assert('getBiomeFallSpeedMult() = 1.0',   getBiomeFallSpeedMult() === 1.0);
      assert('getBiomeLockDelaySecs() = 0',     getBiomeLockDelaySecs() === 0);
      assert('getBiomeLockDrift() = false',     getBiomeLockDrift() === false);
      // LINE_CLEAR_CELLS_NEEDED may not be defined in test context — use 100 as fallback
      var base = (typeof LINE_CLEAR_CELLS_NEEDED !== 'undefined') ? LINE_CLEAR_CELLS_NEEDED : 100;
      assertEqual('getLineClearCellsNeeded() = ' + base, getLineClearCellsNeeded(), base);
    });

    // ── Stone biome ───────────────────────────────────────────────────────────
    describe('Stone biome — standard baseline rules', function () {
      applyBiomeRules('stone');
      var r = getActiveBiomeRules();
      assert('rules object present',           r !== null);
      assertEqual('fallSpeedMult = 1.0',       r.fallSpeedMult,         1.0);
      assertEqual('lockDelayMs = 0',           r.lockDelayMs,           0);
      assertEqual('lockDrift = false',         r.lockDrift,             false);
      assertEqual('lineClearCellsNeeded null', r.lineClearCellsNeeded,  null);
      // Public helpers
      assertEqual('getBiomeFallSpeedMult = 1.0', getBiomeFallSpeedMult(), 1.0);
      assertEqual('getBiomeLockDelaySecs = 0',   getBiomeLockDelaySecs(), 0);
      assert('getBiomeLockDrift = false',        !getBiomeLockDrift());
      // Should fall back to global constant
      var base = (typeof LINE_CLEAR_CELLS_NEEDED !== 'undefined') ? LINE_CLEAR_CELLS_NEEDED : 100;
      assertEqual('getLineClearCellsNeeded = ' + base, getLineClearCellsNeeded(), base);
      clearBiomeRules();
    });

    // ── Forest biome ──────────────────────────────────────────────────────────
    describe('Forest biome — wider board, harder line clears', function () {
      applyBiomeRules('forest');
      var r = getActiveBiomeRules();
      assert('rules object present',                r !== null);
      assertEqual('fallSpeedMult = 1.0',            r.fallSpeedMult,         1.0);
      assertEqual('lockDelayMs = 0',                r.lockDelayMs,           0);
      assertEqual('lockDrift = false',              r.lockDrift,             false);
      assertEqual('lineClearCellsNeeded = 144',     r.lineClearCellsNeeded,  144);
      // Public helpers
      assertEqual('getBiomeFallSpeedMult = 1.0',    getBiomeFallSpeedMult(), 1.0);
      assertEqual('getBiomeLockDelaySecs = 0',      getBiomeLockDelaySecs(), 0);
      assert('getBiomeLockDrift = false',           !getBiomeLockDrift());
      assertEqual('getLineClearCellsNeeded = 144',  getLineClearCellsNeeded(), 144);
      // Edge: 144 > 100 means lines are harder to clear
      var base = (typeof LINE_CLEAR_CELLS_NEEDED !== 'undefined') ? LINE_CLEAR_CELLS_NEEDED : 100;
      assert('Forest threshold > standard', getLineClearCellsNeeded() > base);
      clearBiomeRules();
    });

    // ── Nether biome ──────────────────────────────────────────────────────────
    describe('Nether biome — 1.5× gravity, no lock delay', function () {
      applyBiomeRules('nether');
      var r = getActiveBiomeRules();
      assert('rules object present',             r !== null);
      assertEqual('fallSpeedMult = 1.5',         r.fallSpeedMult,  1.5);
      assertEqual('lockDelayMs = 0',             r.lockDelayMs,    0);
      assertEqual('lockDrift = false',           r.lockDrift,      false);
      // Public helpers
      assertEqual('getBiomeFallSpeedMult = 1.5', getBiomeFallSpeedMult(), 1.5);
      assertEqual('getBiomeLockDelaySecs = 0',   getBiomeLockDelaySecs(), 0);
      assert('getBiomeLockDrift = false',        !getBiomeLockDrift());
      // Edge: multiplier > 1 (pieces fall faster)
      assert('Nether speed > 1.0', getBiomeFallSpeedMult() > 1.0);
      // Edge: no lock delay means no anti-exploit risk
      assert('No lock delay in Nether', getBiomeLockDelaySecs() === 0);
      clearBiomeRules();
    });

    // ── Ice biome ─────────────────────────────────────────────────────────────
    describe('Ice biome — 500 ms lock delay + lateral drift', function () {
      applyBiomeRules('ice');
      var r = getActiveBiomeRules();
      assert('rules object present',              r !== null);
      assertEqual('fallSpeedMult = 1.0',          r.fallSpeedMult,  1.0);
      assertEqual('lockDelayMs = 500',            r.lockDelayMs,    500);
      assertEqual('lockDrift = true',             r.lockDrift,      true);
      // Public helpers
      assertEqual('getBiomeFallSpeedMult = 1.0',  getBiomeFallSpeedMult(), 1.0);
      assertEqual('getBiomeLockDelaySecs = 0.5',  getBiomeLockDelaySecs(), 0.5);
      assert('getBiomeLockDrift = true',          getBiomeLockDrift() === true);
      // Edge: lock delay = 500 ms exactly
      assert('Lock delay exactly 0.5 s',          getBiomeLockDelaySecs() === 0.5);
      // Anti-exploit: scoring fires on actual lock (lock delay does NOT grant extra mining time)
      // — this is structural (enforced by code path), not testable as a value assertion,
      //   but we confirm delay is bounded to the spec value.
      assert('Lock delay ≤ 500 ms (no exploit)',  r.lockDelayMs <= 500);
      // Edge: no board-size override (standard line clear threshold in Ice)
      var base = (typeof LINE_CLEAR_CELLS_NEEDED !== 'undefined') ? LINE_CLEAR_CELLS_NEEDED : 100;
      assertEqual('getLineClearCellsNeeded = ' + base, getLineClearCellsNeeded(), base);
      clearBiomeRules();
    });

    // ── clearBiomeRules ───────────────────────────────────────────────────────
    describe('clearBiomeRules — full state teardown', function () {
      // Apply then clear each biome and verify clean state.
      ['stone', 'forest', 'nether', 'ice'].forEach(function (biome) {
        applyBiomeRules(biome);
        assert(biome + ': rules applied',      getActiveBiomeRules() !== null);
        clearBiomeRules();
        assert(biome + ': rules cleared',      getActiveBiomeRules() === null);
        assertEqual(biome + ': fallMult reset', getBiomeFallSpeedMult(), 1.0);
        assertEqual(biome + ': lockDelay reset', getBiomeLockDelaySecs(), 0);
        assert(biome + ': lockDrift reset',     !getBiomeLockDrift());
      });
    });

    // ── Unknown biome id ──────────────────────────────────────────────────────
    describe('Unknown biome id — graceful fallback', function () {
      applyBiomeRules('unknown_biome');
      assert('unknown biome → rules null', getActiveBiomeRules() === null);
      assertEqual('fallMult defaults to 1.0', getBiomeFallSpeedMult(), 1.0);
      assertEqual('lockDelay defaults to 0',  getBiomeLockDelaySecs(), 0);
      clearBiomeRules();

      applyBiomeRules(null);
      assert('null biome → rules null', getActiveBiomeRules() === null);
      clearBiomeRules();

      applyBiomeRules(undefined);
      assert('undefined biome → rules null', getActiveBiomeRules() === null);
      clearBiomeRules();
    });

    // ── Expedition isolation — Classic mode must not be affected ──────────────
    describe('Classic mode isolation — no bleed', function () {
      // Simulate classic mode: biome rules never applied.
      clearBiomeRules();
      var fallMult = getBiomeFallSpeedMult();
      assertEqual('Classic: fallMult = 1.0', fallMult, 1.0);
      assertEqual('Classic: lockDelay = 0',  getBiomeLockDelaySecs(), 0);
      assert('Classic: no drift',            !getBiomeLockDrift());
      var base = (typeof LINE_CLEAR_CELLS_NEEDED !== 'undefined') ? LINE_CLEAR_CELLS_NEEDED : 100;
      assertEqual('Classic: lineClearCells = ' + base, getLineClearCellsNeeded(), base);
    });

    // ── Summary ───────────────────────────────────────────────────────────────
    var total = _pass + _fail;
    _results.push('\n─────────────────────────────────────');
    _results.push('Result: ' + _pass + '/' + total + ' passed' +
      (_fail > 0 ? ' (' + _fail + ' FAILED)' : ' — all OK'));

    console.log('[biome-rules-test]\n' + _results.join('\n'));
    return { pass: _pass, fail: _fail, total: total };
  }

  return { run: run };
}());
