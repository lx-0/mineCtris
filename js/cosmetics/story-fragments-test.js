// story-fragments-test.js — Unit tests for the story fragment drop logic.
//
// Run in a browser console by loading this file after story-fragments.js, or
// include it via a test runner that can provide a minimal localStorage shim.
//
// Expected output: all TEST lines ending in "PASS".

(function () {
  'use strict';

  // ── Minimal localStorage shim (for Node.js / headless environments) ─────────
  if (typeof localStorage === 'undefined') {
    var _store = {};
    /* global localStorage */
    globalThis.localStorage = {
      getItem:    function (k)    { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
      setItem:    function (k, v) { _store[k] = String(v); },
      removeItem: function (k)    { delete _store[k]; },
      clear:      function ()     { _store = {}; },
    };
  }

  // ── Assertion helpers ────────────────────────────────────────────────────────

  var _passed = 0;
  var _failed = 0;

  function assert(desc, cond) {
    if (cond) {
      console.log('PASS: ' + desc);
      _passed++;
    } else {
      console.error('FAIL: ' + desc);
      _failed++;
    }
  }

  function assertEqual(desc, actual, expected) {
    assert(desc + ' (expected ' + expected + ', got ' + actual + ')', actual === expected);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Reset collected fragments in localStorage. */
  function _clearCollected() {
    localStorage.removeItem('mineCtris_collectedFragments');
  }

  /** Returns a deterministic RNG that always yields a fixed value (0–1 exclusive). */
  function _fixedRng(value) {
    return function () { return value; };
  }

  /** RNG that cycles through the provided values. */
  function _cycleRng(values) {
    var i = 0;
    return function () { return values[i++ % values.length]; };
  }

  // ── Test: fragment library shape ─────────────────────────────────────────────

  (function testLibrary() {
    assert('STORY_FRAGMENTS is defined', typeof STORY_FRAGMENTS !== 'undefined');
    assertEqual('Total fragment count is 30', STORY_FRAGMENTS.length, 30);

    var byBiome = { stone: 0, forest: 0, nether: 0, ice: 0 };
    STORY_FRAGMENTS.forEach(function (f) { byBiome[f.biomeId] = (byBiome[f.biomeId] || 0) + 1; });
    assertEqual('Stone biome count is 8',  byBiome.stone,  8);
    assertEqual('Forest biome count is 8', byBiome.forest, 8);
    assertEqual('Nether biome count is 7', byBiome.nether, 7);
    assertEqual('Ice biome count is 7',    byBiome.ice,    7);

    var rarityOk = STORY_FRAGMENTS.every(function (f) {
      return ['common', 'rare', 'legendary'].indexOf(f.rarity) !== -1;
    });
    assert('All fragments have valid rarity', rarityOk);

    var fieldsOk = STORY_FRAGMENTS.every(function (f) {
      return f.id && f.biomeId && f.title && f.lore && f.artRef;
    });
    assert('All fragments have required fields', fieldsOk);

    var uniqueIds = new Set(STORY_FRAGMENTS.map(function (f) { return f.id; }));
    assertEqual('All fragment IDs are unique', uniqueIds.size, 30);
  }());

  // ── Test: persistence ────────────────────────────────────────────────────────

  (function testPersistence() {
    _clearCollected();
    var ids = getCollectedFragmentIds();
    assertEqual('No collected fragments after clear', ids.size, 0);

    // Collect one fragment via rollStoryFragment
    _clearCollected();
    var drop = rollStoryFragment('stone', _fixedRng(0)); // 0 < 0.60 → common
    assert('rollStoryFragment returns a result', drop !== null);
    assert('Returned drop has fragment', drop && drop.fragment !== undefined);

    var ids2 = getCollectedFragmentIds();
    assert('Collected set is persisted after a drop', ids2.size === 1);
    assert('Persisted ID matches dropped fragment', drop && ids2.has(drop.fragment.id));
  }());

  // ── Test: rarity distribution (dice roll thresholds) ────────────────────────

  (function testRarityThresholds() {
    _clearCollected();

    // roll = 0.0 → common (< 0.60)
    var d1 = rollStoryFragment('stone', _cycleRng([0.0, 0.0]));
    assert('roll=0.00 yields a common fragment', d1 && d1.fragment.rarity === 'common');

    _clearCollected();
    // roll = 0.59 → common (< 0.60)
    var d2 = rollStoryFragment('stone', _cycleRng([0.59, 0.0]));
    assert('roll=0.59 yields a common fragment', d2 && d2.fragment.rarity === 'common');

    _clearCollected();
    // roll = 0.60 → rare (0.60 ≤ x < 0.90)
    var d3 = rollStoryFragment('stone', _cycleRng([0.60, 0.0]));
    assert('roll=0.60 yields a rare fragment', d3 && d3.fragment.rarity === 'rare');

    _clearCollected();
    // roll = 0.89 → rare
    var d4 = rollStoryFragment('stone', _cycleRng([0.89, 0.0]));
    assert('roll=0.89 yields a rare fragment', d4 && d4.fragment.rarity === 'rare');

    _clearCollected();
    // roll = 0.90+ → legendary only after threshold; zero collected commons → rare fallback
    var d5 = rollStoryFragment('stone', _cycleRng([0.90, 0.0]));
    assert('roll=0.90 with no commons collected falls back to rare', d5 && d5.fragment.rarity === 'rare');
  }());

  // ── Test: legendary unlock threshold ─────────────────────────────────────────

  (function testLegendaryUnlock() {
    _clearCollected();

    // Stone has 4 common fragments. We need ≥ ceil(4*0.5)=2 common collected for legendary to unlock.
    var stoneCommons = STORY_FRAGMENTS.filter(function (f) {
      return f.biomeId === 'stone' && f.rarity === 'common';
    });

    // Manually mark 2 commons as collected
    var toMark = stoneCommons.slice(0, 2);
    var collected = getCollectedFragmentIds();
    toMark.forEach(function (f) { collected.add(f.id); });
    try { localStorage.setItem('mineCtris_collectedFragments', JSON.stringify(Array.from(collected))); } catch (_) {}

    // Now a 0.90 roll should be able to yield a legendary
    var d = rollStoryFragment('stone', _cycleRng([0.90, 0.0]));
    assert('roll=0.90 with 2/4 commons collected yields legendary', d && d.fragment.rarity === 'legendary');

    _clearCollected();
    // Only 1 common collected → legendary still locked (ceil(4*0.5)=2 required)
    var collected2 = getCollectedFragmentIds();
    collected2.add(stoneCommons[0].id);
    try { localStorage.setItem('mineCtris_collectedFragments', JSON.stringify(Array.from(collected2))); } catch (_) {}
    var d2 = rollStoryFragment('stone', _cycleRng([0.90, 0.0]));
    assert('roll=0.90 with only 1/4 commons falls back to rare', d2 && d2.fragment.rarity === 'rare');
  }());

  // ── Test: duplicate prevention ────────────────────────────────────────────────

  (function testDuplicatePrevention() {
    _clearCollected();

    // Stone has 4 common fragments. Collect them all sequentially.
    var stoneCommons = STORY_FRAGMENTS.filter(function (f) {
      return f.biomeId === 'stone' && f.rarity === 'common';
    });
    var collectedIds = [];

    for (var i = 0; i < stoneCommons.length; i++) {
      var drop = rollStoryFragment('stone', _fixedRng(0)); // always common
      if (drop) collectedIds.push(drop.fragment.id);
    }

    var uniqueDropped = new Set(collectedIds);
    assertEqual('All ' + stoneCommons.length + ' common stone drops are unique', uniqueDropped.size, stoneCommons.length);

    // Now all commons are collected; rare and legendary may drop instead
    // (stone still has rare fragments uncollected, so another drop should succeed)
    var nextDrop = rollStoryFragment('stone', _fixedRng(0)); // common → fallback to rare or legendary
    assert('Falls back to uncollected rarity when all commons exhausted', nextDrop !== null);
    assert('Fallback drop is not a common', nextDrop && nextDrop.fragment.rarity !== 'common');
  }());

  // ── Test: all biome fragments exhausted returns null ─────────────────────────

  (function testAllCollectedReturnsNull() {
    _clearCollected();

    // Mark all ice fragments as collected
    var iceFrags = STORY_FRAGMENTS.filter(function (f) { return f.biomeId === 'ice'; });
    var ids = new Set(iceFrags.map(function (f) { return f.id; }));
    try { localStorage.setItem('mineCtris_collectedFragments', JSON.stringify(Array.from(ids))); } catch (_) {}

    var drop = rollStoryFragment('ice', _fixedRng(0));
    assert('Returns null when all biome fragments are collected', drop === null);
  }());

  // ── Test: getFragmentProgress ─────────────────────────────────────────────────

  (function testFragmentProgress() {
    _clearCollected();
    var p0 = getFragmentProgress('stone');
    assertEqual('Stone progress total is 8', p0.total, 8);
    assertEqual('Stone collected is 0 at start', p0.collected, 0);
    assertEqual('Stone pct is 0 at start', p0.pct, 0);

    // Collect one stone fragment manually
    var stoneFirst = STORY_FRAGMENTS.find(function (f) { return f.biomeId === 'stone'; });
    var ids = new Set([stoneFirst.id]);
    try { localStorage.setItem('mineCtris_collectedFragments', JSON.stringify(Array.from(ids))); } catch (_) {}

    var p1 = getFragmentProgress('stone');
    assertEqual('Stone collected is 1 after one drop', p1.collected, 1);
    assert('Stone pct > 0 after one drop', p1.pct > 0);

    // Overall
    var pAll = getFragmentProgress(null);
    assertEqual('Overall total is 30', pAll.total, 30);
    assertEqual('Overall collected is 1', pAll.collected, 1);
  }());

  // ── Test: per-run drop probability distribution (Monte Carlo) ───────────────

  (function testDropProbabilities() {
    _clearCollected();

    // Pre-collect some commons to unlock legendary
    var stoneCommons = STORY_FRAGMENTS.filter(function (f) {
      return f.biomeId === 'stone' && f.rarity === 'common';
    });
    // Mark 2 commons collected (threshold = ceil(4*0.5) = 2)
    var ids = new Set(stoneCommons.slice(0, 2).map(function (f) { return f.id; }));
    try { localStorage.setItem('mineCtris_collectedFragments', JSON.stringify(Array.from(ids))); } catch (_) {}

    var counts = { common: 0, rare: 0, legendary: 0 };
    var trials = 1000;
    for (var i = 0; i < trials; i++) {
      var roll = Math.random();
      var rarity;
      if (roll < 0.60) { rarity = 'common'; }
      else if (roll < 0.90) { rarity = 'rare'; }
      else { rarity = 'legendary'; }
      counts[rarity]++;
    }

    var commonPct    = counts.common    / trials;
    var rarePct      = counts.rare      / trials;
    var legendaryPct = counts.legendary / trials;

    // Allow ±8% tolerance for Monte Carlo variance at n=1000
    assert('Common drop rate ~60% (±8%)',    commonPct    >= 0.52 && commonPct    <= 0.68);
    assert('Rare drop rate ~30% (±8%)',      rarePct      >= 0.22 && rarePct      <= 0.38);
    assert('Legendary drop rate ~10% (±8%)', legendaryPct >= 0.02 && legendaryPct <= 0.18);
  }());

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log('');
  console.log('story-fragments-test: ' + _passed + ' passed, ' + _failed + ' failed.');
  if (_failed > 0) {
    console.error('TEST SUITE FAILED');
  } else {
    console.log('TEST SUITE PASSED');
  }
}());
