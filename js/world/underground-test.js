// Underground rendering engine — test suite.
// Run from browser console: undergroundTest.run()
// Requires: underground.js to be loaded first.
//
// All 10 mandatory tests from MINAA-383 are covered.

var undergroundTest = (function () {
  'use strict';

  var _pass = 0;
  var _fail = 0;
  var _results = [];

  function assert(label, condition) {
    if (condition) {
      _pass++;
      _results.push('  \u2713 ' + label);
    } else {
      _fail++;
      _results.push('  \u2717 FAIL: ' + label);
    }
  }

  function assertEqual(label, actual, expected) {
    var ok = actual === expected;
    if (!ok) {
      _results.push('  \u2717 FAIL: ' + label +
        ' \u2014 expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
      _fail++;
    } else {
      _results.push('  \u2713 ' + label);
      _pass++;
    }
  }

  function describe(name, fn) {
    _results.push('\n[' + name + ']');
    fn();
  }

  // ── Prerequisite check ──────────────────────────────────────────────────────
  function checkPrereqs() {
    var needed = [
      'isExposed', 'createExposedMesh', 'onBlockMined', 'onBlockPlaced',
      'initUndergroundGrid', 'ugWorldToIndex', 'ugIndexToWorld',
      'ugInBounds', 'ugMeshCount',
    ];
    for (var i = 0; i < needed.length; i++) {
      if (typeof window[needed[i]] !== 'function') {
        console.error('[underground-test] ' + needed[i] + ' is not defined. Is underground.js loaded?');
        return false;
      }
    }
    if (typeof undergroundGrid === 'undefined') {
      console.error('[underground-test] undergroundGrid global is missing.');
      return false;
    }
    return true;
  }

  // ── Test helpers ────────────────────────────────────────────────────────────

  /**
   * Build a minimal stub world so the underground module can create and
   * dispose meshes without a real Three.js scene.
   *
   * Returns { restore } — call restore() to put back the originals.
   */
  function stubWorld() {
    var _meshCount = 0;
    var _addedMeshes = [];
    var _removedMeshes = [];

    var savedWorldGroup   = window.worldGroup;
    var savedCreateBlock  = window.createBlockMesh;
    var savedDisposeBlock = window.disposeBlock;
    var savedTHREE        = window.THREE;

    // Minimal THREE stub (only what underground.js needs)
    window.THREE = window.THREE || {};
    window.THREE.Color = window.THREE.Color || function (v) { this.v = v; };

    // worldGroup stub
    window.worldGroup = {
      add:    function (m) { _addedMeshes.push(m);   _meshCount++; },
      remove: function (m) { _removedMeshes.push(m); _meshCount = Math.max(0, _meshCount - 1); },
    };

    // createBlockMesh stub: returns an object that mimics a Three.js Mesh
    window.createBlockMesh = function (color) {
      return {
        _isFakeMesh: true,
        position: { set: function () {} },
        name: '',
        userData: {},
      };
    };

    // disposeBlock stub
    window.disposeBlock = function (mesh) {
      if (mesh) mesh._disposed = true;
    };

    return {
      addedCount:   function () { return _addedMeshes.length; },
      removedCount: function () { return _removedMeshes.length; },
      restore: function () {
        window.worldGroup   = savedWorldGroup;
        window.createBlockMesh  = savedCreateBlock;
        window.disposeBlock = savedDisposeBlock;
        // Don't restore THREE — it's already present in the real environment.
      },
    };
  }

  /** Reset the undergroundGrid to a fresh solid state without using initUndergroundGrid
   *  (which creates meshes and needs worldGroup).  Used for pure logic tests. */
  function buildSolidGrid() {
    undergroundGrid = [];
    for (var xi = 0; xi < 20; xi++) {
      undergroundGrid[xi] = [];
      for (var zi = 0; zi < 20; zi++) {
        undergroundGrid[xi][zi] = [];
        for (var yi = 0; yi < 31; yi++) {
          var mat = (yi === 30) ? 'bedrock' : (yi <= 3 ? 'dirt' : 'stone');
          undergroundGrid[xi][zi][yi] = { material: mat, mesh: null };
        }
      }
    }
  }

  // ── Tests ───────────────────────────────────────────────────────────────────

  function run() {
    _pass = 0; _fail = 0; _results = [];

    if (!checkPrereqs()) {
      console.error('[underground-test] Prerequisites not met — aborting.');
      return { pass: 0, fail: 1, total: 1 };
    }

    // ── Test 1: isExposed() basic — surrounded block returns false ────────────
    describe('Test 1: isExposed() basic — all-6-sides surrounded returns false', function () {
      buildSolidGrid();
      // Block at (5, 5, 5): all 6 neighbours exist and are solid → not exposed
      assert('interior block not exposed', !isExposed(5, 5, 5));
      // Also check a deep interior block
      assert('interior block (10,10,15) not exposed', !isExposed(10, 10, 15));
    });

    // ── Test 2: isExposed() one face open ────────────────────────────────────
    describe('Test 2: isExposed() one face open — single air neighbour returns true', function () {
      buildSolidGrid();
      // Mine one neighbour of (5, 5, 5) → (6, 5, 5) becomes air
      undergroundGrid[6][5][5] = null;
      assert('block adjacent to air is exposed', isExposed(5, 5, 5));
      // Restore
      undergroundGrid[6][5][5] = { material: 'stone', mesh: null };
      assert('block with all neighbours solid is not exposed', !isExposed(5, 5, 5));
    });

    // ── Test 3: isExposed() boundary ─────────────────────────────────────────
    describe('Test 3: isExposed() boundary — edge block exposed on boundary side', function () {
      buildSolidGrid();
      // xi=0 has no xi=-1 neighbour → boundary → exposed
      assert('xi=0 edge block is exposed',  isExposed(0,  5,  5));
      assert('xi=19 edge block is exposed', isExposed(19, 5,  5));
      assert('zi=0 edge block is exposed',  isExposed(5,  0,  5));
      assert('zi=19 edge block is exposed', isExposed(5,  19, 5));
      assert('yi=0 top block is exposed',   isExposed(5,  5,  0));   // boundary above
      assert('yi=30 bottom block is exposed', isExposed(5, 5, 30));  // boundary below
      // Interior block (no boundary adjacency) is NOT exposed when fully surrounded
      assert('interior non-boundary block not exposed', !isExposed(5, 5, 5));
    });

    // ── Test 4: Mine block → expose neighbours ────────────────────────────────
    describe('Test 4: Mine block → expose neighbours', function () {
      buildSolidGrid();
      var stub = stubWorld();

      // All interior neighbours of (5, 5, 5) are initially unexposed
      var initMesh = ugMeshCount();
      assertEqual('mesh count before mining', initMesh, 0);

      // Simulate mining (5, 5, 5): set to air, check neighbours
      // Manually do what the mining code + onBlockMined do together:
      undergroundGrid[5][5][5] = null;  // external dispose already happened
      onBlockMined(5, 5, 5);

      // 6 neighbours: (6,5,5),(4,5,5),(5,6,5),(5,4,5),(5,5,6),(5,5,4)
      // All are interior-non-boundary blocks that were surrounded.  After (5,5,5)
      // becomes air each of them has exactly one open face → should be exposed now.
      assert('(6,5,5) now has a mesh',  undergroundGrid[6][5][5] && undergroundGrid[6][5][5].mesh !== null);
      assert('(4,5,5) now has a mesh',  undergroundGrid[4][5][5] && undergroundGrid[4][5][5].mesh !== null);
      assert('(5,6,5) now has a mesh',  undergroundGrid[5][6][5] && undergroundGrid[5][6][5].mesh !== null);
      assert('(5,4,5) now has a mesh',  undergroundGrid[5][4][5] && undergroundGrid[5][4][5].mesh !== null);
      assert('(5,5,6) now has a mesh',  undergroundGrid[5][5][6] && undergroundGrid[5][5][6].mesh !== null);
      assert('(5,5,4) now has a mesh',  undergroundGrid[5][5][4] && undergroundGrid[5][5][4].mesh !== null);
      assertEqual('exactly 6 meshes added', stub.addedCount(), 6);

      stub.restore();
    });

    // ── Test 5: Place block → bury neighbours ─────────────────────────────────
    describe('Test 5: Place block → bury neighbours', function () {
      buildSolidGrid();
      var stub = stubWorld();

      // Hollow out a 3×3×3 cavity centred at (5,5,5) so all 6 neighbours are air
      for (var dxi = -1; dxi <= 1; dxi++) {
        for (var dzi = -1; dzi <= 1; dzi++) {
          for (var dyi = -1; dyi <= 1; dyi++) {
            undergroundGrid[5+dxi][5+dzi][5+dyi] = null;
          }
        }
      }

      // Manually create meshes for the 6 face-neighbours that are now exposed
      // (they border the air at centre and are solid themselves)
      var faceNeighbours = [
        [6,5,5],[4,5,5],[5,6,5],[5,4,5],[5,5,6],[5,5,4]
      ];
      // These are all null (part of our hollowed cavity), so let's use the ring
      // one step further out that became exposed.  Simplify: manually place solid
      // blocks with fake meshes for the 6 immediate neighbours, then place centre.
      for (var i = 0; i < faceNeighbours.length; i++) {
        var n = faceNeighbours[i];
        undergroundGrid[n[0]][n[1]][n[2]] = {
          material: 'stone',
          mesh: { _isFakeMesh: true, _disposed: false },
        };
      }

      var addsBefore = stub.addedCount();
      // Place a block at the centre — it fills the air there.
      // Its 6 solid neighbours were exposed (had meshes); placing this block
      // fully buries each of them → their meshes should be removed.
      onBlockPlaced(5, 5, 5, 'stone');

      // The centre cell is now solid
      assert('centre cell is solid after place', undergroundGrid[5][5][5] !== null);

      // All 6 face neighbours should now be buried (no mesh)
      var allBuried = true;
      for (var j = 0; j < faceNeighbours.length; j++) {
        var fn = faceNeighbours[j];
        if (undergroundGrid[fn[0]][fn[1]][fn[2]] && undergroundGrid[fn[0]][fn[1]][fn[2]].mesh !== null) {
          allBuried = false;
        }
      }
      assert('all 6 face neighbours buried (mesh removed)', allBuried);

      stub.restore();
    });

    // ── Test 6: Surface layer at init — only Y=0.5 blocks have meshes ─────────
    describe('Test 6: Surface layer at init — only yi=0 (Y=0.5) blocks have meshes', function () {
      var stub = stubWorld();
      initUndergroundGrid();

      // Exactly 20×20 = 400 meshes expected (surface layer only)
      assertEqual('mesh count after init = 400', ugMeshCount(), 400);

      // Every yi=0 cell has a mesh
      var allSurfaceHaveMesh = true;
      for (var xi = 0; xi < 20; xi++) {
        for (var zi = 0; zi < 20; zi++) {
          if (!undergroundGrid[xi][zi][0] || !undergroundGrid[xi][zi][0].mesh) {
            allSurfaceHaveMesh = false;
          }
        }
      }
      assert('every yi=0 cell has a mesh', allSurfaceHaveMesh);

      // No cell below yi=0 has a mesh
      var noDeepMesh = true;
      for (var xi2 = 0; xi2 < 20; xi2++) {
        for (var zi2 = 0; zi2 < 20; zi2++) {
          for (var yi = 1; yi < 31; yi++) {
            if (undergroundGrid[xi2][zi2][yi] && undergroundGrid[xi2][zi2][yi].mesh) {
              noDeepMesh = false;
            }
          }
        }
      }
      assert('no mesh exists below yi=0 at init', noDeepMesh);

      stub.restore();
    });

    // ── Test 7: Bedrock boundary ──────────────────────────────────────────────
    describe('Test 7: Bedrock boundary — yi=30 (Y=-29.5) handled correctly', function () {
      buildSolidGrid();
      // yi=30 has no yi=31 neighbour → boundary → isExposed returns true
      assert('yi=30 block is exposed (bottom boundary)', isExposed(5, 5, 30));
      // Its material should be bedrock
      assertEqual('yi=30 material is bedrock', undergroundGrid[5][5][30].material, 'bedrock');
      // ugInBounds returns false for yi=31
      assert('yi=31 is out of bounds', !ugInBounds(5, 5, 31));
      // yi=30, xi=0 is exposed both on left (xi=-1) and bottom (yi=31) boundaries
      assert('corner bedrock (0,5,30) is exposed', isExposed(0, 5, 30));
    });

    // ── Test 8: Mine shaft integration ────────────────────────────────────────
    describe('Test 8: Mine shaft integration — 5 blocks straight down', function () {
      buildSolidGrid();
      var stub = stubWorld();

      // Mine a vertical shaft at (10, 10, 1..5) from yi=1 to yi=5.
      // Start with yi=0 already having a mesh (surface layer).
      undergroundGrid[10][10][0].mesh = { _isFakeMesh: true };

      var expectedMeshCount = 1; // start: only yi=0 has mesh
      assertEqual('initial mesh count', ugMeshCount(), expectedMeshCount);

      for (var depth = 1; depth <= 5; depth++) {
        // Simulate mining the block: external dispose has already happened
        undergroundGrid[10][10][depth] = null;
        onBlockMined(10, 10, depth);

        // After mining depth=1 from yi=1: the yi=2 block below becomes exposed.
        // Each step: one new block (the next layer) becomes exposed on top.
        // Side walls don't change because adjacent blocks are still solid.
        // The yi=0 mesh was already there, yi=depth+1 gets a mesh (if within bounds),
        // and yi=depth-1 is already air.
        // Additionally the 4 cardinal horizontal neighbours at each depth get meshes
        // on the first time they are adjacent to the shaft.
        // We only check the shaft extends correctly — verify the deepest mined-out
        // cell is null and the cell just below has a mesh.
        assert('cell at depth=' + depth + ' is air', undergroundGrid[10][10][depth] === null);
        if (depth < 30) {
          assert('cell below shaft (depth=' + depth + '+1) is solid',
            undergroundGrid[10][10][depth + 1] !== null);
          assert('cell below shaft has a mesh after mining depth=' + depth,
            undergroundGrid[10][10][depth + 1] !== null &&
            undergroundGrid[10][10][depth + 1].mesh !== null);
        }
      }

      // After 5 mines the mesh count must be below the 2,400 cap
      assert('mesh count below 2400 cap', ugMeshCount() < 2400);

      stub.restore();
    });

    // ── Test 9: Piece fills hole ───────────────────────────────────────────────
    describe('Test 9: Piece fills hole — drop into shaft, meshes update correctly', function () {
      buildSolidGrid();
      var stub = stubWorld();

      // Create a single-block shaft at (10, 10, yi=2): mine yi=1 and yi=2.
      undergroundGrid[10][10][1] = null;
      onBlockMined(10, 10, 1);
      undergroundGrid[10][10][2] = null;
      onBlockMined(10, 10, 2);

      // After mining yi=1 and yi=2: the 4 horizontal neighbours of each mined
      // block now have meshes, and yi=3 has a mesh on its top face.
      assert('yi=3 has mesh (exposed above by shaft)', undergroundGrid[10][10][3] !== null && undergroundGrid[10][10][3].mesh !== null);

      // Piece block lands at (xi=10, zi=10, yi=2) — fills the bottom of the shaft.
      onBlockPlaced(10, 10, 2, 'stone');

      // yi=2 is now solid again
      assert('yi=2 is solid after piece lands', undergroundGrid[10][10][2] !== null);

      // yi=3 (below the placed block) should now be buried again — no mesh
      assert('yi=3 mesh removed (buried by placed block)', undergroundGrid[10][10][3] !== null && undergroundGrid[10][10][3].mesh === null);

      // yi=1 is still air — the placed block at yi=2 should have a mesh
      // because yi=1 (above it) is still null.
      assert('placed block at yi=2 has a mesh (exposed to yi=1 air)',
        undergroundGrid[10][10][2].mesh !== null);

      stub.restore();
    });

    // ── Test 10: No orphaned meshes ───────────────────────────────────────────
    describe('Test 10: No orphaned meshes — mine-and-fill cycle leaves no undisposed meshes', function () {
      buildSolidGrid();
      var stub = stubWorld();
      var _disposedMeshes = [];

      // Override disposeBlock to track disposals
      var _origDispose = window.disposeBlock;
      window.disposeBlock = function (mesh) {
        if (mesh) {
          mesh._disposed = true;
          _disposedMeshes.push(mesh);
        }
      };

      // Mine a 2×2×2 cube at (5..6, 5..6, 3..4)
      var minedCells = [
        [5,5,3],[5,6,3],[6,5,3],[6,6,3],
        [5,5,4],[5,6,4],[6,5,4],[6,6,4],
      ];
      for (var i = 0; i < minedCells.length; i++) {
        var c = minedCells[i];
        undergroundGrid[c[0]][c[1]][c[2]] = null;
        onBlockMined(c[0], c[1], c[2]);
      }

      var meshCountAfterMine = ugMeshCount();
      assert('mesh count after mining > 0 (exposed walls visible)', meshCountAfterMine > 0);
      assert('mesh count after mining < 2400', meshCountAfterMine < 2400);

      // Fill the cavity back by placing blocks
      for (var j = 0; j < minedCells.length; j++) {
        var fc = minedCells[j];
        onBlockPlaced(fc[0], fc[1], fc[2], 'stone');
      }

      var meshCountAfterFill = ugMeshCount();

      // After fill, all cavity-wall meshes that were created during mining
      // should have been disposed (removed by onBlockPlaced when neighbours
      // became buried).  No cell that is fully surrounded should carry a mesh.
      var orphaned = false;
      for (var xi = 1; xi < 19; xi++) {
        for (var zi = 1; zi < 19; zi++) {
          for (var yi = 1; yi < 30; yi++) {
            var cell = undergroundGrid[xi][zi][yi];
            if (cell && cell.mesh && !isExposed(xi, zi, yi)) {
              orphaned = true;
            }
          }
        }
      }
      assert('no orphaned meshes on fully buried blocks', !orphaned);

      // All disposed meshes should have _disposed flag set
      var allDisposedClean = true;
      for (var k = 0; k < _disposedMeshes.length; k++) {
        if (!_disposedMeshes[k]._disposed) allDisposedClean = false;
      }
      assert('all disposed meshes have _disposed flag', allDisposedClean);

      // Restore disposeBlock
      window.disposeBlock = _origDispose;
      stub.restore();
    });

    // ── Summary ───────────────────────────────────────────────────────────────
    var total = _pass + _fail;
    _results.push('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    _results.push('Result: ' + _pass + '/' + total + ' passed' +
      (_fail > 0 ? ' (' + _fail + ' FAILED)' : ' \u2014 all OK'));

    console.log('[underground-test]\n' + _results.join('\n'));
    return { pass: _pass, fail: _fail, total: total };
  }

  return { run: run };
}());
